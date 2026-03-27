package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	baml_client "github.com/hmw-workshop/backend/baml_client"
)

// writeJSONError writes a JSON error response with the given status code.
func writeJSONError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// streamSSE consumes a BAML streaming channel and writes SSE events to the response.
// Each partial and the final value are sent as `data: {json}\n\n`.
// A `data: [DONE]\n\n` sentinel is sent when the stream completes.
func streamSSE[TStream, TFinal any](w http.ResponseWriter, r *http.Request, ch <-chan baml_client.StreamValue[TStream, TFinal]) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher.Flush()

	ctx := r.Context()
	for val := range ch {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if val.IsError {
			log.Printf("BAML stream error: %v", val.Error)
			return
		}

		var data any
		if val.IsFinal {
			data = val.Final()
		} else {
			data = val.Stream()
		}

		jsonBytes, err := json.Marshal(data)
		if err != nil {
			log.Printf("JSON marshal error: %v", err)
			continue
		}

		fmt.Fprintf(w, "data: %s\n\n", jsonBytes)
		flusher.Flush()
	}

	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
}
