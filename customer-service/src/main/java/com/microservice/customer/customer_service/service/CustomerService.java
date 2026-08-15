package com.microservice.customer.customer_service.service;

import com.microservice.customer.customer_service.entity.Customer;
import com.microservice.customer.customer_service.repository.CustomerRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CustomerService {
    @Autowired
    private CustomerRepository customerRepository;

    public Customer saveCustomer(Customer customer) { return customerRepository.save(customer); }

    public Customer findCustomerById(String userId) { return customerRepository.findCustomerById(userId); }
}
