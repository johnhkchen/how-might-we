package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	baml_client "github.com/hmw-workshop/backend/baml_client"
	baml_types "github.com/hmw-workshop/backend/baml_client/types"
)

type personaRequest struct {
	RawInput string `json:"rawInput"`
}

// handlePersona streams a refined Persona from rough text input.
// POST /api/persona { "rawInput": "..." }
func handlePersona(w http.ResponseWriter, r *http.Request) {
	var req personaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.RawInput) == "" {
		writeJSONError(w, "rawInput is required", http.StatusBadRequest)
		return
	}

	ch, err := baml_client.Stream.RefinePersona(r.Context(), req.RawInput)
	if err != nil {
		log.Printf("RefinePersona stream error: %v", err)
		writeJSONError(w, "failed to start persona stream", http.StatusInternalServerError)
		return
	}

	streamSSE(w, r, ch)
}

type analyzeRequest struct {
	Statement string                   `json:"statement"`
	Context   baml_types.ProblemContext `json:"context"`
}

// handleAnalyze streams an HMWAnalysis for a rough HMW statement.
// POST /api/analyze { "statement": "...", "context": ProblemContext }
func handleAnalyze(w http.ResponseWriter, r *http.Request) {
	var req analyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Statement) == "" {
		writeJSONError(w, "statement is required", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Context.Domain) == "" {
		writeJSONError(w, "context.domain is required", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Context.Persona.Label) == "" {
		writeJSONError(w, "context.persona.label is required", http.StatusBadRequest)
		return
	}

	ch, err := baml_client.Stream.AnalyzeHMW(r.Context(), req.Statement, req.Context)
	if err != nil {
		log.Printf("AnalyzeHMW stream error: %v", err)
		writeJSONError(w, "failed to start analyze stream", http.StatusInternalServerError)
		return
	}

	streamSSE(w, r, ch)
}

type expandRequest struct {
	Analysis baml_types.HMWAnalysis      `json:"analysis"`
	Context  baml_types.ProblemContext    `json:"context"`
}

// handleExpand streams HMWExpansion variants from an analysis.
// POST /api/expand { "analysis": HMWAnalysis, "context": ProblemContext }
func handleExpand(w http.ResponseWriter, r *http.Request) {
	var req expandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Analysis.OriginalStatement) == "" {
		writeJSONError(w, "analysis.originalStatement is required", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Analysis.UnderlyingTension) == "" {
		writeJSONError(w, "analysis.underlyingTension is required", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Context.Domain) == "" {
		writeJSONError(w, "context.domain is required", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Context.Persona.Label) == "" {
		writeJSONError(w, "context.persona.label is required", http.StatusBadRequest)
		return
	}

	ch, err := baml_client.Stream.ExpandHMW(r.Context(), req.Analysis, req.Context)
	if err != nil {
		log.Printf("ExpandHMW stream error: %v", err)
		writeJSONError(w, "failed to start expand stream", http.StatusInternalServerError)
		return
	}

	streamSSE(w, r, ch)
}

type refineRequest struct {
	Session baml_types.HMWSession `json:"session"`
}

// handleRefine streams HMWRefinement from a full session state.
// POST /api/refine { "session": HMWSession }
func handleRefine(w http.ResponseWriter, r *http.Request) {
	var req refineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Session.Context.Domain) == "" {
		writeJSONError(w, "session.context.domain is required", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Session.Context.Persona.Label) == "" {
		writeJSONError(w, "session.context.persona.label is required", http.StatusBadRequest)
		return
	}

	if len(req.Session.Candidates) == 0 {
		writeJSONError(w, "session.candidates must not be empty", http.StatusBadRequest)
		return
	}

	ch, err := baml_client.Stream.RefineHMW(r.Context(), req.Session)
	if err != nil {
		log.Printf("RefineHMW stream error: %v", err)
		writeJSONError(w, "failed to start refine stream", http.StatusInternalServerError)
		return
	}

	streamSSE(w, r, ch)
}
