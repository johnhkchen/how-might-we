package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/persona", handlePersona)
	mux.HandleFunc("POST /api/analyze", handleAnalyze)
	mux.HandleFunc("POST /api/expand", handleExpand)
	mux.HandleFunc("POST /api/refine", handleRefine)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting HMW Workshop API on :%s", port)
	if err := http.ListenAndServe(":"+port, corsMiddleware(mux)); err != nil {
		log.Fatal(err)
	}
}
