package com.microservice.user.user_service.repository;


import com.microservice.user.user_service.entity.User;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface UserRepository extends MongoRepository<User, String> {

    User findUserById(String userId);
}