package com.microservice.user.dto;

public record LoginResponse(String token, String id, String name, String email, String role) {
}
