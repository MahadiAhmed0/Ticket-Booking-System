package com.microservice.user.controller;

import com.microservice.user.dto.LoginRequest;
import com.microservice.user.dto.LoginResponse;
import com.microservice.user.model.User;
import com.microservice.user.repository.UserRepository;
import com.microservice.user.security.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/users")
public class UserController {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;

    public UserController(UserRepository userRepository, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
    }

    // ---------- registration (public) ----------

    @PostMapping
    public User register(@RequestBody User user) {
        return userRepository.save(user);
    }

    // ---------- login -> JWT (public) ----------

    @PostMapping("/login")
    public LoginResponse login(@RequestBody LoginRequest request) {
        User user = userRepository.findByEmail(request.email());
        if (user == null || !user.getPassword().equals(request.password())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        String token = jwtUtil.generateToken(user);
        return new LoginResponse(token, user.getId(), user.getName(), user.getEmail(),
                user.getRole() == null ? "USER" : user.getRole());
    }

    // Creates an ADMIN account. Protected at the API Gateway (admin token required).
    @PostMapping("/admin/register")
    public User registerAdmin(@RequestBody User user) {
        user.setRole("ADMIN");
        return userRepository.save(user);
    }

    // ---------- token validation for other services (public endpoint, validates the token it receives) ----------

    @PostMapping("/validate")
    public LoginResponse validate(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing Authorization header");
        }
        try {
            String userId = jwtUtil.getUserIdFromToken(header.substring(7));
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
            return new LoginResponse(null, user.getId(), user.getName(), user.getEmail(),
                    user.getRole() == null ? "USER" : user.getRole());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
    }

    // ---------- profile of the logged-in user (JWT protected) ----------

    @GetMapping("/me")
    public User getMyProfile(HttpServletRequest request) {
        String userId = (String) request.getAttribute("userId");
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    // ---------- profile management (JWT protected; only your own profile) ----------

    @PutMapping("/{id}")
    public User updateProfile(@PathVariable String id, @RequestBody User updates, HttpServletRequest request) {
        String userId = (String) request.getAttribute("userId");
        if (!userId.equals(id)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only update your own profile");
        }
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found: " + id));
        if (updates.getName() != null && !updates.getName().isBlank()) {
            user.setName(updates.getName());
        }
        if (updates.getEmail() != null && !updates.getEmail().isBlank()) {
            user.setEmail(updates.getEmail());
        }
        if (updates.getPassword() != null && !updates.getPassword().isBlank()) {
            user.setPassword(updates.getPassword());
        }
        return userRepository.save(user);
    }

    // ---------- public reads (used internally by other services) ----------

    @GetMapping
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    @GetMapping("/{id}")
    public User getUserById(@PathVariable String id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found: " + id));
    }
}
