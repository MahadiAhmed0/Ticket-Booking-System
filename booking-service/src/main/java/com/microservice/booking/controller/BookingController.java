package com.microservice.booking.controller;

import com.microservice.booking.dto.BookingRequest;
import com.microservice.booking.model.Booking;
import com.microservice.booking.repository.BookingRepository;
import com.microservice.booking.service.BookingService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/bookings")
public class BookingController {

    private final BookingService bookingService;
    private final BookingRepository bookingRepository;

    public BookingController(BookingService bookingService, BookingRepository bookingRepository) {
        this.bookingService = bookingService;
        this.bookingRepository = bookingRepository;
    }

    // ---------- admin analytics (protected at the API Gateway) ----------

    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        List<Booking> all = bookingRepository.findAll();
        long confirmed = all.stream().filter(b -> "CONFIRMED".equals(b.getStatus())).count();
        long cancelled = all.stream().filter(b -> "CANCELLED".equals(b.getStatus())).count();
        long pending = all.stream().filter(b -> "PENDING".equals(b.getStatus())).count();
        double revenue = all.stream()
                .filter(b -> "CONFIRMED".equals(b.getStatus()))
                .mapToDouble(Booking::getTotalPrice)
                .sum();

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalBookings", all.size());
        stats.put("confirmed", confirmed);
        stats.put("cancelled", cancelled);
        stats.put("pending", pending);
        stats.put("revenue", Math.round(revenue * 100.0) / 100.0);
        return stats;
    }

    // ---------- user booking flow ----------

    @PostMapping
    public Booking createBooking(@RequestBody BookingRequest request) {
        return bookingService.createBooking(request);
    }

    @GetMapping
    public List<Booking> getAllBookings() {
        return bookingRepository.findAll();
    }

    @GetMapping("/{id}")
    public Booking getBookingById(@PathVariable String id) {
        return bookingRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found: " + id));
    }

    // Cancel a booking (owner only). Seats are released and a BookingCancelled
    // event is published to RabbitMQ.
    @PostMapping("/{id}/cancel")
    public Booking cancelBooking(@PathVariable String id, @RequestBody Map<String, String> body) {
        return bookingService.cancelBooking(id, body.get("userId"));
    }
}
