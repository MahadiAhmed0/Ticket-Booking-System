package com.microservice.customer.customer_service.repository;


import com.microservice.customer.customer_service.entity.Customer;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface CustomerRepository extends MongoRepository<Customer, String> {

    Customer findCustomerById(String userId);
}
