package com.microservice.booking.messaging;

import com.microservice.booking.config.RabbitConfig;
import com.microservice.booking.model.Booking;
import com.microservice.booking.repository.BookingRepository;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * Consumes payment result events published by the Payment Service and
 * finalizes the order:
 * - PaymentCompleted -> mark booking CONFIRMED + publish BookingConfirmed event.
 * - PaymentFailed    -> release the seats + mark booking CANCELLED.
 *
 * Message format (plain string, split by |): bookingId|amount|SUCCESS|FAILED
 */
@Component
public class BookingPaymentListener {

    private final BookingRepository bookingRepository;
    private final RabbitTemplate rabbitTemplate;
    private final RestTemplate restTemplate;

    public BookingPaymentListener(BookingRepository bookingRepository,
                                  RabbitTemplate rabbitTemplate,
                                  RestTemplate restTemplate) {
        this.bookingRepository = bookingRepository;
        this.rabbitTemplate = rabbitTemplate;
        this.restTemplate = restTemplate;
    }

    @RabbitListener(queues = RabbitConfig.PAYMENT_COMPLETED_QUEUE)
    public synchronized void onPaymentCompleted(String message) {
        String bookingId = message.split("\\|")[0];
        Booking booking = bookingRepository.findById(bookingId).orElse(null);
        if (booking == null || !"PENDING".equals(booking.getStatus())) {
            return; // idempotency: only finalize PENDING bookings once
        }
        booking.setStatus("CONFIRMED");
        bookingRepository.save(booking);
        System.out.println("[BOOKING] Booking " + bookingId + " CONFIRMED via PaymentCompleted event");

        rabbitTemplate.convertAndSend(RabbitConfig.BOOKING_EXCHANGE, RabbitConfig.BOOKING_CONFIRMED_ROUTING_KEY,
                "BOOKING_CONFIRMED|" + booking.getId() + "|" + booking.getUserEmail() + "|"
                        + booking.getEventName() + "|" + booking.getTotalPrice());
    }

    @RabbitListener(queues = RabbitConfig.PAYMENT_FAILED_QUEUE)
    public synchronized void onPaymentFailed(String message) {
        String bookingId = message.split("\\|")[0];
        Booking booking = bookingRepository.findById(bookingId).orElse(null);
        if (booking == null || !"PENDING".equals(booking.getStatus())) {
            return;
        }
        restTemplate.postForObject(
                "http://EVENT-SERVICE/events/" + booking.getEventId() + "/cancel?seats=" + booking.getSeats(),
                null, Object.class);
        booking.setStatus("CANCELLED");
        bookingRepository.save(booking);
        System.out.println("[BOOKING] Booking " + bookingId + " CANCELLED via PaymentFailed event");
    }
}
