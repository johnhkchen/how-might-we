package main

import (
	"net/http"
	"os"
)

func corsMiddleware(next http.Handler) http.Handler {
	// On Lambda, the Function URL handles CORS natively.
	// Adding headers here would duplicate them, which some browsers reject.
	if os.Getenv("AWS_LAMBDA_RUNTIME_API") != "" {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
