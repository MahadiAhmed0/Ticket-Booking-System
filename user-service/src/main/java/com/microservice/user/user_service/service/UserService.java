package com.microservice.user.user_service.service;

import com.microservice.user.user_service.entity.User;
import com.microservice.user.user_service.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserService {
    @Autowired
    private UserRepository userRepository;

    public User saveUser(User user) { return userRepository.save(user); }

    public User findUserById(String userId) { return userRepository.findUserById(userId); }
}