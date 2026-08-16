package com.microservice.notification.messaging;

import com.microservice.notification.config.RabbitConfig;
import com.microservice.notification.service.EmailLogService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * Consumes async events from the Booking and Payment services and "sends"
 * the corresponding emails (fire-and-forget).
 *
 * Message formats (plain strings, split by |):
 *   booking : BOOKING_CONFIRMED|bookingId|userEmail|eventName|totalPrice
 *   payment : bookingId|amount|SUCCESS  or  bookingId|amount|FAILED
 */
@Component
public class NotificationListener {

    private final EmailLogService emailLogService;

    public NotificationListener(EmailLogService emailLogService) {
        this.emailLogService = emailLogService;
    }

    @RabbitListener(queues = RabbitConfig.BOOKING_CONFIRMED_QUEUE)
    public void onBookingConfirmed(String message) throws InterruptedException {
        String[] parts = message.split("\\|");
        Thread.sleep(500); // pretend we are sending an email
        emailLogService.send("Booking confirmation",
                "Booking " + parts[1] + " for '" + parts[3] + "' confirmed. Total: $" + parts[4],
                parts[2]);
    }

    @RabbitListener(queues = RabbitConfig.BOOKING_CANCELLED_QUEUE)
    public void onBookingCancelled(String message) throws InterruptedException {
        String[] parts = message.split("\\|");
        Thread.sleep(500); // pretend we are sending an email
        emailLogService.send("Booking cancelled",
                "Booking " + parts[1] + " for '" + parts[3] + "' was cancelled. Your seats have been released.",
                parts[2]);
    }

    @RabbitListener(queues = RabbitConfig.PAYMENT_COMPLETED_QUEUE)
    public void onPaymentCompleted(String message) throws InterruptedException {
        String[] parts = message.split("\\|");
        Thread.sleep(500);
        emailLogService.send("Payment receipt",
                "Payment of $" + parts[1] + " for booking " + parts[0] + " was successful",
                "user@example.com");
    }

    @RabbitListener(queues = RabbitConfig.PAYMENT_FAILED_QUEUE)
    public void onPaymentFailed(String message) {
        String[] parts = message.split("\\|");
        emailLogService.send("Payment failure notice",
                "Payment of $" + parts[1] + " for booking " + parts[0] + " failed",
                "user@example.com");
    }
}
