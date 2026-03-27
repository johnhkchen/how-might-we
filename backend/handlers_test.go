package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlePersona_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/persona", nil)
	w := httptest.NewRecorder()

	handlePersona(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandlePersona_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/persona", strings.NewReader("{bad"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handlePersona(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandlePersona_MissingRawInput(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/persona", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handlePersona(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandlePersona_EmptyRawInput(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/persona", strings.NewReader(`{"rawInput": ""}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handlePersona(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandlePersona_WhitespaceRawInput(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/persona", strings.NewReader(`{"rawInput": "   "}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handlePersona(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// Valid minimal context JSON for analyze tests
const validContext = `{"domain":"design","persona":{"label":"Designer","role":"UX Designer","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}`

func TestHandleAnalyze_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/analyze", nil)
	w := httptest.NewRecorder()

	handleAnalyze(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleAnalyze_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/analyze", strings.NewReader("{bad"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleAnalyze(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleAnalyze_MissingStatement(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/analyze", strings.NewReader(`{"context":`+validContext+`}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleAnalyze(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleAnalyze_EmptyStatement(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/analyze", strings.NewReader(`{"statement":"","context":`+validContext+`}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleAnalyze(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleAnalyze_WhitespaceStatement(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/analyze", strings.NewReader(`{"statement":"   ","context":`+validContext+`}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleAnalyze(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleAnalyze_MissingContext(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/analyze", strings.NewReader(`{"statement":"How might we test?"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleAnalyze(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleAnalyze_MissingPersonaLabel(t *testing.T) {
	body := `{"statement":"How might we test?","context":{"domain":"design","persona":{"label":"","role":"UX Designer","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`
	req := httptest.NewRequest(http.MethodPost, "/api/analyze", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleAnalyze(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// Valid minimal analysis JSON for expand tests
const validAnalysis = `{"originalStatement":"How might we test?","implicitUser":"tester","embeddedAssumptions":[],"scopeLevel":"well_scoped","underlyingTension":"tension here","initialReframing":"reframed"}`

func TestHandleExpand_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/expand", nil)
	w := httptest.NewRecorder()

	handleExpand(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleExpand_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/expand", strings.NewReader("{bad"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleExpand(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleExpand_MissingOriginalStatement(t *testing.T) {
	body := `{"analysis":{"originalStatement":"","implicitUser":"tester","embeddedAssumptions":[],"scopeLevel":"well_scoped","underlyingTension":"tension","initialReframing":"reframed"},"context":` + validContext + `}`
	req := httptest.NewRequest(http.MethodPost, "/api/expand", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleExpand(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleExpand_MissingUnderlyingTension(t *testing.T) {
	body := `{"analysis":{"originalStatement":"How might we test?","implicitUser":"tester","embeddedAssumptions":[],"scopeLevel":"well_scoped","underlyingTension":"","initialReframing":"reframed"},"context":` + validContext + `}`
	req := httptest.NewRequest(http.MethodPost, "/api/expand", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleExpand(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleExpand_MissingDomain(t *testing.T) {
	body := `{"analysis":` + validAnalysis + `,"context":{"domain":"","persona":{"label":"Designer","role":"UX Designer","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`
	req := httptest.NewRequest(http.MethodPost, "/api/expand", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleExpand(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleExpand_MissingPersonaLabel(t *testing.T) {
	body := `{"analysis":` + validAnalysis + `,"context":{"domain":"design","persona":{"label":"","role":"UX Designer","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`
	req := httptest.NewRequest(http.MethodPost, "/api/expand", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleExpand(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// Valid minimal session JSON for refine tests
const validCandidate = `{"id":"c1","variant":{"statement":"How might we test?","moveType":"narrowed","rationale":"focuses scope"},"status":"SELECTED"}`
const validSessionContext = `{"domain":"design","persona":{"label":"Designer","role":"UX Designer","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}`

func TestHandleRefine_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/refine", nil)
	w := httptest.NewRecorder()

	handleRefine(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleRefine_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/refine", strings.NewReader("{bad"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleRefine(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleRefine_MissingDomain(t *testing.T) {
	body := `{"session":{"context":{"domain":"","persona":{"label":"Designer","role":"UX","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]},"candidates":[` + validCandidate + `],"clippedIds":[],"iterationCount":1}}`
	req := httptest.NewRequest(http.MethodPost, "/api/refine", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleRefine(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleRefine_MissingPersonaLabel(t *testing.T) {
	body := `{"session":{"context":{"domain":"design","persona":{"label":"","role":"UX","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]},"candidates":[` + validCandidate + `],"clippedIds":[],"iterationCount":1}}`
	req := httptest.NewRequest(http.MethodPost, "/api/refine", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleRefine(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleRefine_EmptyCandidates(t *testing.T) {
	body := `{"session":{"context":` + validSessionContext + `,"candidates":[],"clippedIds":[],"iterationCount":1}}`
	req := httptest.NewRequest(http.MethodPost, "/api/refine", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleRefine(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestCORS_HeadersPresent(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/persona", handlePersona)
	handler := corsMiddleware(mux)

	req := httptest.NewRequest(http.MethodPost, "/api/persona", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, "*")
	}
	if got := w.Header().Get("Access-Control-Allow-Methods"); got != "POST, OPTIONS" {
		t.Errorf("Access-Control-Allow-Methods = %q, want %q", got, "POST, OPTIONS")
	}
	if got := w.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type" {
		t.Errorf("Access-Control-Allow-Headers = %q, want %q", got, "Content-Type")
	}
}

func TestCORS_Preflight(t *testing.T) {
	mux := http.NewServeMux()
	handler := corsMiddleware(mux)

	req := httptest.NewRequest(http.MethodOptions, "/api/persona", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, "*")
	}
}
