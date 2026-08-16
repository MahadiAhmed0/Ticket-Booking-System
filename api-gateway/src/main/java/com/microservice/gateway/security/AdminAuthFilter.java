package com.microservice.gateway.security;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * Protects the ADMIN side of the system. Requests matching an admin route
 * must carry a valid JWT with role = ADMIN.
 *
 * Admin routes:
 *   POST   /events                  create event
 *   PUT    /events/**               update event
 *   DELETE /events/**               delete event
 *   GET    /bookings/stats          admin analytics
 *   POST   /users/admin/register    create another admin
 */
@Component
public class AdminAuthFilter implements GlobalFilter, Ordered {

    private final JwtUtil jwtUtil;

    public AdminAuthFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getPath().value();
        String method = request.getMethod() == null ? "" : request.getMethod().name();

        // never block CORS preflight
        if (request.getMethod() == HttpMethod.OPTIONS) {
            return chain.filter(exchange);
        }

        if (!isAdminRoute(path, method)) {
            return chain.filter(exchange);
        }

        String header = request.getHeaders().getFirst("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return reject(exchange, HttpStatus.UNAUTHORIZED, "Missing Authorization header");
        }
        try {
            String role = jwtUtil.getRoleFromToken(header.substring(7));
            if (!"ADMIN".equals(role)) {
                return reject(exchange, HttpStatus.FORBIDDEN, "ADMIN role required");
            }
        } catch (Exception e) {
            return reject(exchange, HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
        return chain.filter(exchange);
    }

    private boolean isAdminRoute(String path, String method) {
        if ("POST".equals(method) && path.equals("/events")) return true;
        if (("PUT".equals(method) || "DELETE".equals(method)) && path.startsWith("/events/")) return true;
        if ("GET".equals(method) && path.equals("/bookings/stats")) return true;
        if ("POST".equals(method) && path.startsWith("/users/admin/")) return true;
        return false;
    }

    private Mono<Void> reject(ServerWebExchange exchange, HttpStatus status, String message) {
        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        byte[] bytes = ("{\"message\":\"" + message + "\"}").getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(bytes);
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -50;
    }
}
