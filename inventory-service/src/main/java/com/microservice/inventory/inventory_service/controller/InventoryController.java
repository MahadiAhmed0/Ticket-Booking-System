package com.microservice.inventory.inventory_service.controller;

import com.microservice.inventory.inventory_service.Constants;
import com.microservice.inventory.inventory_service.entity.Product;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class InventoryController {

    private final Map<String, Product> products = new HashMap<>();

    public InventoryController() {
        products.put("P001", new Product("P001", "Laptop", 10));
        products.put("P002", new Product("P002", "Mouse", 5));
        products.put("P003", new Product("P003", "Keyboard", 3));
    }

    @RabbitListener(queues = Constants.QUEUE)
    public void consumeMessageFromQueue(Map<String, Object> orderEvent) {
        String orderId = String.valueOf(orderEvent.get("orderId"));
        String productId = String.valueOf(orderEvent.get("productId"));
        int requestedQuantity = Integer.parseInt(String.valueOf(orderEvent.get("quantity")));

        Product product = products.get(productId);

        if (product == null) {
            System.out.println("Order " + orderId + " could not be fulfilled: product "
                    + productId + " not found in inventory.");
            return;
        }

        if (requestedQuantity > product.getQuantity()) {
            System.out.println("Order " + orderId + " could not be fulfilled: requested quantity "
                    + requestedQuantity + " exceeds available stock of " + product.getQuantity()
                    + " for " + product.getName() + " (" + productId + ").");
            return;
        }

        product.setQuantity(product.getQuantity() - requestedQuantity);
        System.out.println("Order " + orderId + " fulfilled: " + requestedQuantity + " x "
                + product.getName() + " (" + productId + "). Remaining stock: "
                + product.getQuantity() + ".");
    }
}
