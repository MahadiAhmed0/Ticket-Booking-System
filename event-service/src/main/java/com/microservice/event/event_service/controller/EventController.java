package com.microservice.event.event_service.controller;

import com.microservice.event.event_service.entity.Event;
import com.microservice.event.event_service.service.EventService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/events")
public class EventController {
    @Autowired
    public EventService eventService;

    @PostMapping("/")
    public Event saveEvent(@RequestBody Event event) {
        return eventService.saveEvent(event);
    }

    @GetMapping("/{id}")
    public Event findEventById(@PathVariable("id") String id) {
        return eventService.findEventById(id);
    }

    @GetMapping("/")
    public String hello() {
        return "hello";
    }
}