package com.microservice.event.controller;

import com.microservice.event.model.Event;
import com.microservice.event.repository.EventRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/events")
public class EventController {

    private final EventRepository eventRepository;

    public EventController(EventRepository eventRepository) {
        this.eventRepository = eventRepository;
    }

    @PostMapping
    public Event createEvent(@RequestBody Event event) {
        return eventRepository.save(event);
    }

    @GetMapping
    public List<Event> getAllEvents() {
        return eventRepository.findAll();
    }

    @GetMapping("/{id}")
    public Event getEventById(@PathVariable String id) {
        return eventRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found: " + id));
    }

    // Called by the Booking Service to atomically reserve seats.
    @PostMapping("/{id}/book")
    public synchronized Event bookSeats(@PathVariable String id, @RequestParam int seats) {
        Event event = getEventById(id);
        if (event.getBookedSeats() + seats > event.getTotalSeats()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Not enough seats available: " + (event.getTotalSeats() - event.getBookedSeats()) + " left");
        }
        event.setBookedSeats(event.getBookedSeats() + seats);
        return eventRepository.save(event);
    }

    // Called by the Booking Service to release seats when payment fails.
    @PostMapping("/{id}/cancel")
    public synchronized Event cancelSeats(@PathVariable String id, @RequestParam int seats) {
        Event event = getEventById(id);
        event.setBookedSeats(Math.max(0, event.getBookedSeats() - seats));
        return eventRepository.save(event);
    }

    // ---------- admin management (protected at the API Gateway) ----------

    @PutMapping("/{id}")
    public Event updateEvent(@PathVariable String id, @RequestBody Event updates) {
        Event event = getEventById(id);
        if (updates.getName() != null && !updates.getName().isBlank()) event.setName(updates.getName());
        if (updates.getVenue() != null && !updates.getVenue().isBlank()) event.setVenue(updates.getVenue());
        if (updates.getDate() != null && !updates.getDate().isBlank()) event.setDate(updates.getDate());
        if (updates.getCategory() != null && !updates.getCategory().isBlank()) event.setCategory(updates.getCategory());
        if (updates.getPrice() > 0) event.setPrice(updates.getPrice());
        if (updates.getTotalSeats() != null && updates.getTotalSeats() > 0) event.setTotalSeats(updates.getTotalSeats());
        return eventRepository.save(event);
    }

    @DeleteMapping("/{id}")
    public void deleteEvent(@PathVariable String id) {
        eventRepository.deleteById(id);
    }
}
