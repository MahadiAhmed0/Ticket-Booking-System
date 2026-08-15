package com.microservice.user.user_service.controller;

import com.microservice.user.user_service.entity.User;
import com.microservice.user.user_service.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/users")
public class UserController {
    @Autowired
    public UserService userService;

    @PostMapping("/")
    public User saveUser(@RequestBody User user) {
        return userService.saveUser(user);
    }

    @GetMapping("/{id}")
    public User findUserById(@PathVariable("id") String id) {
        return userService.findUserById(id);
    }

    @GetMapping("/")
    public String hello() {
        return "hello";
    }
}