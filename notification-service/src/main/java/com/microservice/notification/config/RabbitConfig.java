package com.microservice.notification.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * This service CONSUMES events from its OWN queues (each consuming service
 * must have its own queue bound to the exchange, otherwise RabbitMQ
 * delivers each message to only one consumer).
 */
@Configuration
public class RabbitConfig {

    public static final String BOOKING_EXCHANGE = "booking-exchange";
    public static final String BOOKING_CONFIRMED_ROUTING_KEY = "booking.confirmed";
    public static final String BOOKING_CONFIRMED_QUEUE = "booking-confirmed-notification-queue";
    public static final String BOOKING_CANCELLED_ROUTING_KEY = "booking.cancelled";
    public static final String BOOKING_CANCELLED_QUEUE = "booking-cancelled-notification-queue";

    public static final String PAYMENT_EXCHANGE = "payment-exchange";
    public static final String PAYMENT_COMPLETED_ROUTING_KEY = "payment.completed";
    public static final String PAYMENT_FAILED_ROUTING_KEY = "payment.failed";
    public static final String PAYMENT_COMPLETED_QUEUE = "payment-completed-notification-queue";
    public static final String PAYMENT_FAILED_QUEUE = "payment-failed-notification-queue";

    @Bean
    public Queue bookingConfirmedQueue() {
        return new Queue(BOOKING_CONFIRMED_QUEUE, true);
    }

    @Bean
    public Queue bookingCancelledQueue() {
        return new Queue(BOOKING_CANCELLED_QUEUE, true);
    }

    @Bean
    public Queue paymentCompletedQueue() {
        return new Queue(PAYMENT_COMPLETED_QUEUE, true);
    }

    @Bean
    public Queue paymentFailedQueue() {
        return new Queue(PAYMENT_FAILED_QUEUE, true);
    }

    @Bean
    public DirectExchange bookingExchange() {
        return new DirectExchange(BOOKING_EXCHANGE);
    }

    @Bean
    public DirectExchange paymentExchange() {
        return new DirectExchange(PAYMENT_EXCHANGE);
    }

    @Bean
    public Binding bookingConfirmedBinding(Queue bookingConfirmedQueue, DirectExchange bookingExchange) {
        return BindingBuilder.bind(bookingConfirmedQueue).to(bookingExchange).with(BOOKING_CONFIRMED_ROUTING_KEY);
    }

    @Bean
    public Binding bookingCancelledBinding(Queue bookingCancelledQueue, DirectExchange bookingExchange) {
        return BindingBuilder.bind(bookingCancelledQueue).to(bookingExchange).with(BOOKING_CANCELLED_ROUTING_KEY);
    }

    @Bean
    public Binding paymentCompletedBinding(Queue paymentCompletedQueue, DirectExchange paymentExchange) {
        return BindingBuilder.bind(paymentCompletedQueue).to(paymentExchange).with(PAYMENT_COMPLETED_ROUTING_KEY);
    }

    @Bean
    public Binding paymentFailedBinding(Queue paymentFailedQueue, DirectExchange paymentExchange) {
        return BindingBuilder.bind(paymentFailedQueue).to(paymentExchange).with(PAYMENT_FAILED_ROUTING_KEY);
    }
}
