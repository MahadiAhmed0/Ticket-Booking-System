package com.microservice.product.product_service.repository;


import com.microservice.product.product_service.entity.Product;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ProductRepository extends MongoRepository<Product, String> {

    Product findProductById(String productId);
}
