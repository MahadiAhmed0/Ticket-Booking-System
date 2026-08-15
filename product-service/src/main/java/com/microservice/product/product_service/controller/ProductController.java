package com.microservice.product.product_service.controller;

import com.microservice.product.product_service.entity.Product;
import com.microservice.product.product_service.service.ProductService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/products")
public class ProductController {
    @Autowired
    public ProductService productService;

    @PostMapping("/")
    public Product saveProduct(@RequestBody Product product) {
        return productService.saveProduct(product);
    }

    @GetMapping("/{id}")
    public Product findProductById(@PathVariable("id") String productId) {
        return productService.findProductById(productId);
    }

    @GetMapping("/")
    public String hello() {
        return "hello";
    }
}
