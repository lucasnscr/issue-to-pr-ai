package dev.continuousai.catalog.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * MVC controller that forwards the root path to the static catalog UI.
 * All API endpoints, Swagger and Actuator remain unaffected.
 */
@Controller
public class CatalogViewController {

    @GetMapping("/")
    public String catalogUi() {
        return "redirect:/catalog/index.html";
    }
}
