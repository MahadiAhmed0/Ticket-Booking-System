package com.microservice.product.product_service.service;

import com.microservice.product.product_service.entity.Product;
import com.microservice.product.product_service.repository.ProductRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ProductService {
    @Autowired
    private ProductRepository productRepository;

    public Product saveProduct(Product employee) { return productRepository.save(employee); }

    public Product findProductById(String productId) { return productRepository.findProductById(productId); }
}
