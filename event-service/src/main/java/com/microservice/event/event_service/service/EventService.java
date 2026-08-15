package com.microservice.event.event_service.service;

import com.microservice.event.event_service.entity.Event;
import com.microservice.event.event_service.repository.EventRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class EventService {
    @Autowired
    private EventRepository eventRepository;

    public Event saveEvent(Event event) { return eventRepository.save(event); }

    public Event findEventById(String eventId) { return eventRepository.findEventById(eventId); }
}