package com.microservice.employee.employee_service.repository;


import com.microservice.employee.employee_service.entity.Employee;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface EmployeeRepository extends MongoRepository<Employee, String> {

    Employee findEmployeeById(String userId);
}
