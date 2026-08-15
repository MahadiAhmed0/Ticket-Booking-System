package com.microservice.employee.employee_service.controller;

import com.microservice.employee.employee_service.entity.Employee;
import com.microservice.employee.employee_service.service.EmployeeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/employees")
public class EmployeeController {
    @Autowired
    public EmployeeService employeeService;

    @PostMapping("/")
    public Employee saveEmployee(@RequestBody Employee employee) {
        return employeeService.saveEmployee(employee);
    }

    @GetMapping("/{id}")
    public Employee findEmployeeById(@PathVariable("id") String employeeId) {
        return employeeService.findEmployeeById(employeeId);
    }

    @GetMapping("/")
    public String hello() {
        return "hello";
    }
}
