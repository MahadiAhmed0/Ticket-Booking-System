package com.microservice.payment.config;

import org.springframework.amqp.core.DirectExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * This service only PUBLISHES payment result events to the payment-exchange.
 * Consumers (Booking Service, Notification Service) declare their own queues
 * bound to this exchange.
 */
@Configuration
public class RabbitConfig {

    public static final String EXCHANGE = "payment-exchange";
    public static final String COMPLETED_ROUTING_KEY = "payment.completed";
    public static final String FAILED_ROUTING_KEY = "payment.failed";

    @Bean
    public DirectExchange paymentExchange() {
        return new DirectExchange(EXCHANGE);
    }
}
