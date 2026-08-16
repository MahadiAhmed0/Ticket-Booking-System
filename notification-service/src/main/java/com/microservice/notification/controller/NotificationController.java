package com.microservice.notification.controller;

import com.microservice.notification.service.EmailLogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/notifications")
public class NotificationController {

    private final EmailLogService emailLogService;

    public NotificationController(EmailLogService emailLogService) {
        this.emailLogService = emailLogService;
    }

    @GetMapping
    public List<String> getSentNotifications() {
        return emailLogService.getSentEmails();
    }
}
