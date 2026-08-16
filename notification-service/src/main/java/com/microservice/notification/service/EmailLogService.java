package com.microservice.notification.service;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * In-memory log of "sent" emails (a real system would use an email gateway).
 */
@Service
public class EmailLogService {

    private final List<String> sentEmails = new ArrayList<>();

    public synchronized void send(String subject, String body, String to) {
        String entry = "[" + LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) + "] "
                + "To: " + to + " | Subject: " + subject + " | " + body;
        sentEmails.add(entry);
        System.out.println("================================================");
        System.out.println("[NOTIFICATION] " + entry);
        System.out.println("================================================");
    }

    public synchronized List<String> getSentEmails() {
        return new ArrayList<>(sentEmails);
    }
}
