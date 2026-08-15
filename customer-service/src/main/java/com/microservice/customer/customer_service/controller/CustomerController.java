package com.microservice.customer.customer_service.controller;

import com.microservice.customer.customer_service.entity.Customer;
import com.microservice.customer.customer_service.service.CustomerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/customers")
public class CustomerController {
    @Autowired
    public CustomerService customerService;

    @PostMapping("/")
    public Customer saveEmployee(@RequestBody Customer employee) {
        return customerService.saveCustomer(employee);
    }

    @GetMapping("/{id}")
    public Customer findCustomerById(@PathVariable("id") String productId) {
        return customerService.findCustomerById(productId);
    }

    @GetMapping("/")
    public String hello() {
        return "hello";
    }
}
