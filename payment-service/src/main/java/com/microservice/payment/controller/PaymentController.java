package com.microservice.payment.controller;

import com.microservice.payment.model.Payment;
import com.microservice.payment.repository.PaymentRepository;
import com.microservice.payment.service.PaymentService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/payments")
public class PaymentController {

    private final PaymentService paymentService;
    private final PaymentRepository paymentRepository;

    public PaymentController(PaymentService paymentService, PaymentRepository paymentRepository) {
        this.paymentService = paymentService;
        this.paymentRepository = paymentRepository;
    }

    @PostMapping
    public Payment processPayment(@RequestBody Map<String, Object> request) {
        String bookingId = String.valueOf(request.get("bookingId"));
        double amount = ((Number) request.get("amount")).doubleValue();
        return paymentService.processPayment(bookingId, amount);
    }

    @GetMapping
    public List<Payment> getAllPayments() {
        return paymentRepository.findAll();
    }
}
