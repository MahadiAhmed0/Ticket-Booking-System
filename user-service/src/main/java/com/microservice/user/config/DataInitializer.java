package com.microservice.user.config;

import com.microservice.user.model.User;
import com.microservice.user.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Bootstraps a default ADMIN account so the admin side of the system is
 * usable right after the first start.
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;

    public DataInitializer(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void run(String... args) {
        if (!userRepository.existsByRole("ADMIN")) {
            User admin = new User("Admin", "admin@example.com", "admin123");
            admin.setRole("ADMIN");
            userRepository.save(admin);
            System.out.println("============================================================");
            System.out.println("[USER-SERVICE] Default ADMIN created: admin@example.com / admin123");
            System.out.println("============================================================");
        }
    }
}
