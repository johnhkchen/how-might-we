package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// startLambda starts the Lambda runtime loop with a streaming handler that
// wraps the given http.Handler. Each Lambda invocation is translated to an
// http.Request, served by the handler, and the response is streamed back
// via LambdaFunctionURLStreamingResponse.
func startLambda(handler http.Handler) {
	lambda.Start(func(ctx context.Context, event events.LambdaFunctionURLRequest) (*events.LambdaFunctionURLStreamingResponse, error) {
		req, err := lambdaEventToHTTPRequest(ctx, event)
		if err != nil {
			return &events.LambdaFunctionURLStreamingResponse{
				StatusCode: http.StatusBadRequest,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       strings.NewReader(`{"error":"bad request"}`),
			}, nil
		}

		pr, pw := io.Pipe()
		rw := &lambdaResponseWriter{
			headers: http.Header{},
			pipe:    pw,
			ready:   make(chan struct{}),
		}

		go func() {
			defer pw.Close()
			handler.ServeHTTP(rw, req)
		}()

		// Block until the handler has written headers (via WriteHeader, Write, or Flush).
		<-rw.ready

		return &events.LambdaFunctionURLStreamingResponse{
			StatusCode: rw.statusCode,
			Headers:    flattenHeaders(rw.headers),
			Body:       pr,
		}, nil
	})
}

// lambdaEventToHTTPRequest converts a Lambda Function URL event into a standard http.Request.
func lambdaEventToHTTPRequest(ctx context.Context, event events.LambdaFunctionURLRequest) (*http.Request, error) {
	u := &url.URL{
		Path:     event.RawPath,
		RawQuery: event.RawQueryString,
	}

	var body io.Reader
	if event.Body != "" {
		if event.IsBase64Encoded {
			decoded, err := base64.StdEncoding.DecodeString(event.Body)
			if err != nil {
				return nil, err
			}
			body = bytes.NewReader(decoded)
		} else {
			body = strings.NewReader(event.Body)
		}
	}

	req, err := http.NewRequestWithContext(ctx, event.RequestContext.HTTP.Method, u.String(), body)
	if err != nil {
		return nil, err
	}

	for k, v := range event.Headers {
		req.Header.Set(k, v)
	}

	return req, nil
}

// lambdaResponseWriter implements http.ResponseWriter and http.Flusher,
// capturing headers and status code while streaming body bytes through a pipe.
type lambdaResponseWriter struct {
	headers    http.Header
	statusCode int
	pipe       *io.PipeWriter
	ready      chan struct{}
	readyOnce  sync.Once
}

func (w *lambdaResponseWriter) Header() http.Header {
	return w.headers
}

func (w *lambdaResponseWriter) WriteHeader(code int) {
	w.readyOnce.Do(func() {
		w.statusCode = code
		close(w.ready)
	})
}

func (w *lambdaResponseWriter) Write(b []byte) (int, error) {
	w.readyOnce.Do(func() {
		w.statusCode = http.StatusOK
		close(w.ready)
	})
	return w.pipe.Write(b)
}

// Flush implements http.Flusher. On the first call it signals that headers are
// ready, which unblocks the Lambda response. Pipe writes are immediately
// available to the reader, so no additional flush is needed.
func (w *lambdaResponseWriter) Flush() {
	w.readyOnce.Do(func() {
		if w.statusCode == 0 {
			w.statusCode = http.StatusOK
		}
		close(w.ready)
	})
}

// flattenHeaders converts http.Header (multi-value) to a single-value map for Lambda.
func flattenHeaders(h http.Header) map[string]string {
	flat := make(map[string]string, len(h))
	for k, v := range h {
		flat[k] = strings.Join(v, ", ")
	}
	return flat
}
