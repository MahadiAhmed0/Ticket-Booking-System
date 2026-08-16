package com.microservice.booking.service;

import com.microservice.booking.config.RabbitConfig;
import com.microservice.booking.dto.BookingRequest;
import com.microservice.booking.dto.EventDto;
import com.microservice.booking.dto.PaymentDto;
import com.microservice.booking.dto.UserDto;
import com.microservice.booking.model.Booking;
import com.microservice.booking.repository.BookingRepository;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@Service
public class BookingService {

    private final RestTemplate restTemplate;
    private final BookingRepository bookingRepository;
    private final RabbitTemplate rabbitTemplate;

    public BookingService(RestTemplate restTemplate, BookingRepository bookingRepository,
                          RabbitTemplate rabbitTemplate) {
        this.restTemplate = restTemplate;
        this.bookingRepository = bookingRepository;
        this.rabbitTemplate = rabbitTemplate;
    }

    /**
     * Orchestrates the booking workflow:
     * 1. SYNC call to USER-SERVICE to validate the user.
     * 2. SYNC call to EVENT-SERVICE to reserve seats (locks them).
     * 3. Creates a PENDING booking.
     * 4. SYNC call to PAYMENT-SERVICE (accept/reject response).
     *    On immediate rejection: release seats, mark CANCELLED, report error.
     * 5. On acceptance, the booking stays PENDING and is finalized ASYNC when the
     *    PaymentCompleted / PaymentFailed event arrives (see BookingPaymentListener).
     */
    public Booking createBooking(BookingRequest request) {
        UserDto user = getUser(request.getUserId());
        EventDto event = bookSeats(request.getEventId(), request.getSeats());

        double totalPrice = event.getPrice() * request.getSeats();
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        Booking booking = new Booking(user.getId(), user.getName(), user.getEmail(),
                event.getId(), event.getName(), request.getSeats(), totalPrice, "PENDING", now);
        bookingRepository.save(booking);

        PaymentDto payment = charge(booking.getId(), totalPrice);
        if ("FAILED".equals(payment.getStatus())) {
            // Do NOT touch seats/status here: the PaymentFailed event consumer
            // (BookingPaymentListener) is the single place that releases seats
            // and cancels the order. Handling it in both places causes a race.
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "Payment rejected, seats will be released");
        }
        Booking latest = bookingRepository.findById(booking.getId()).orElse(booking);
        return latest; // PENDING or CONFIRMED — the PaymentCompleted event confirms it
    }

    private PaymentDto charge(String bookingId, double amount) {
        Map<String, Object> body = new HashMap<>();
        body.put("bookingId", bookingId);
        body.put("amount", amount);
        try {
            return restTemplate.postForObject("http://PAYMENT-SERVICE/payments", body, PaymentDto.class);
        } catch (HttpClientErrorException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Payment service error");
        }
    }

    /**
     * Cancels a CONFIRMED booking:
     * 1. Only the booking owner may cancel it (403 otherwise).
     * 2. Seats are released on the Event Service.
     * 3. A BookingCancelled event is published (Notification Service emails the user).
     */
    public Booking cancelBooking(String bookingId, String userId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found: " + bookingId));
        if (!booking.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only cancel your own bookings");
        }
        if ("CANCELLED".equals(booking.getStatus())) {
            return booking; // already cancelled — idempotent
        }
        if ("PENDING".equals(booking.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking is still being processed, try again shortly");
        }

        restTemplate.postForObject(
                "http://EVENT-SERVICE/events/" + booking.getEventId() + "/cancel?seats=" + booking.getSeats(),
                null, Object.class);
        booking.setStatus("CANCELLED");
        bookingRepository.save(booking);
        System.out.println("[BOOKING] Booking " + bookingId + " cancelled by user, seats released");

        rabbitTemplate.convertAndSend(RabbitConfig.BOOKING_EXCHANGE, RabbitConfig.BOOKING_CANCELLED_ROUTING_KEY,
                "BOOKING_CANCELLED|" + booking.getId() + "|" + booking.getUserEmail() + "|" + booking.getEventName());
        return booking;
    }

    private UserDto getUser(String userId) {
        try {
            return restTemplate.getForObject("http://USER-SERVICE/users/" + userId, UserDto.class);
        } catch (HttpClientErrorException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User not found: " + userId);
        }
    }

    private EventDto bookSeats(String eventId, int seats) {
        try {
            return restTemplate.postForObject(
                    "http://EVENT-SERVICE/events/" + eventId + "/book?seats=" + seats,
                    null, EventDto.class);
        } catch (HttpClientErrorException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Not enough seats for event: " + eventId);
        }
    }
}
