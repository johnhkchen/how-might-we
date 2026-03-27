package main

import "net/http"

// handlePersona streams a refined Persona from rough text input.
// POST /api/persona { "rawInput": "..." }
func handlePersona(w http.ResponseWriter, r *http.Request) {
	// TODO: parse input, call BAML RefinePersona, stream SSE response
	http.Error(w, "not implemented", http.StatusNotImplemented)
}

// handleAnalyze streams an HMWAnalysis for a rough HMW statement.
// POST /api/analyze { "statement": "...", "context": ProblemContext }
func handleAnalyze(w http.ResponseWriter, r *http.Request) {
	// TODO: parse input, call BAML AnalyzeHMW, stream SSE response
	http.Error(w, "not implemented", http.StatusNotImplemented)
}

// handleExpand streams HMWExpansion variants from an analysis.
// POST /api/expand { "analysis": HMWAnalysis, "context": ProblemContext }
func handleExpand(w http.ResponseWriter, r *http.Request) {
	// TODO: parse input, call BAML ExpandHMW, stream SSE response
	http.Error(w, "not implemented", http.StatusNotImplemented)
}

// handleRefine streams HMWRefinement from a full session state.
// POST /api/refine { "session": HMWSession }
func handleRefine(w http.ResponseWriter, r *http.Request) {
	// TODO: parse input, call BAML RefineHMW, stream SSE response
	http.Error(w, "not implemented", http.StatusNotImplemented)
}
