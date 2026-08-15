package com.microservice.event.event_service.repository;


import com.microservice.event.event_service.entity.Event;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface EventRepository extends MongoRepository<Event, String> {

    Event findEventById(String eventId);
}