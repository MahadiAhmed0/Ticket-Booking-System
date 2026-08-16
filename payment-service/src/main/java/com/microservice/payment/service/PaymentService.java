package com.microservice.payment.service;

import com.microservice.payment.config.RabbitConfig;
import com.microservice.payment.model.Payment;
import com.microservice.payment.repository.PaymentRepository;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final RabbitTemplate rabbitTemplate;

    public PaymentService(PaymentRepository paymentRepository, RabbitTemplate rabbitTemplate) {
        this.paymentRepository = paymentRepository;
        this.rabbitTemplate = rabbitTemplate;
    }

    /**
     * Simulated payment gateway: succeeds up to $1000, fails above.
     * Publishes a PaymentCompleted / PaymentFailed event on RabbitMQ so the
     * Booking Service can finalize or cancel the order asynchronously.
     */
    public Payment processPayment(String bookingId, double amount) {
        try {
            Thread.sleep(1000); // pretend we are talking to a payment gateway
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        String status = amount <= 1000 ? "SUCCESS" : "FAILED";
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        Payment payment = paymentRepository.save(new Payment(bookingId, amount, status, now));

        String message = bookingId + "|" + amount + "|" + status;
        if ("SUCCESS".equals(status)) {
            rabbitTemplate.convertAndSend(RabbitConfig.EXCHANGE, RabbitConfig.COMPLETED_ROUTING_KEY, message);
            System.out.println("[PAYMENT] PaymentCompleted event published for booking " + bookingId);
        } else {
            rabbitTemplate.convertAndSend(RabbitConfig.EXCHANGE, RabbitConfig.FAILED_ROUTING_KEY, message);
            System.out.println("[PAYMENT] PaymentFailed event published for booking " + bookingId);
        }
        return payment;
    }
}
