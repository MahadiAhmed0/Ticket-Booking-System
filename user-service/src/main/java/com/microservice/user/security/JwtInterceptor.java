package com.microservice.user.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

/**
 * Protects the JWT-secured endpoints:
 * - GET  /users/me            (profile of the logged-in user)
 * - PUT  /users/{id}          (profile management)
 * - DELETE /users/{id}
 *
 * GET /users/{id} stays open because other services (Booking Service)
 * call it internally to validate a user.
 */
@Component
public class JwtInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;

    public JwtInterceptor(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {

        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        String path = request.getRequestURI().substring(request.getContextPath().length());
        String method = request.getMethod();

        boolean needsAuth = path.equals("/users/me")
                || ("PUT".equals(method) && path.matches("/users/[^/]+"))
                || ("DELETE".equals(method) && path.matches("/users/[^/]+"));

        if (!needsAuth) {
            return true;
        }

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                String userId = jwtUtil.getUserIdFromToken(header.substring(7));
                request.setAttribute("userId", userId);
                return true;
            } catch (Exception e) {
                reject(response, "Invalid or expired token");
                return false;
            }
        }
        reject(response, "Missing Authorization header");
        return false;
    }

    private void reject(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
