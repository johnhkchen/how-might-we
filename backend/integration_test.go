//go:build integration

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// --- SSE Test Helpers ---

// readSSEDataLines reads all `data: ` lines from an SSE response body.
func readSSEDataLines(body io.Reader) ([]string, error) {
	scanner := bufio.NewScanner(body)
	var dataLines []string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			dataLines = append(dataLines, strings.TrimPrefix(line, "data: "))
		}
	}
	return dataLines, scanner.Err()
}

// extractFinalJSON asserts the SSE stream has the expected shape and returns the final JSON line.
func extractFinalJSON(t *testing.T, dataLines []string) string {
	t.Helper()
	if len(dataLines) < 2 {
		t.Fatalf("expected at least 2 data lines (partial + [DONE]), got %d", len(dataLines))
	}
	if last := dataLines[len(dataLines)-1]; last != "[DONE]" {
		t.Fatalf("last data line = %q, want [DONE]", last)
	}
	return dataLines[len(dataLines)-2]
}

// postSSE sends a JSON POST to the given path on the server and returns parsed SSE data lines.
// It asserts 200 status, text/event-stream content type, and CORS headers.
func postSSE(t *testing.T, serverURL, path, bodyJSON string) []string {
	t.Helper()
	resp, err := http.Post(serverURL+path, "application/json", strings.NewReader(bodyJSON))
	if err != nil {
		t.Fatalf("POST %s failed: %v", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusInternalServerError {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("POST %s: expected 200, got 500: %s", path, string(b))
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST %s: expected 200, got %d", path, resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("POST %s: Content-Type = %q, want text/event-stream", path, ct)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("POST %s: Access-Control-Allow-Origin = %q, want %q", path, got, "*")
	}

	dataLines, err := readSSEDataLines(resp.Body)
	if err != nil {
		t.Fatalf("POST %s: reading SSE body: %v", path, err)
	}
	return dataLines
}

// newTestServer creates an httptest.NewServer with all routes and CORS middleware.
func newTestServer() *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/persona", handlePersona)
	mux.HandleFunc("POST /api/analyze", handleAnalyze)
	mux.HandleFunc("POST /api/expand", handleExpand)
	mux.HandleFunc("POST /api/refine", handleRefine)
	return httptest.NewServer(corsMiddleware(mux))
}

// skipIfNoAPIKey skips the test if ANTHROPIC_API_KEY is not set.
func skipIfNoAPIKey(t *testing.T) {
	t.Helper()
	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		t.Skip("ANTHROPIC_API_KEY not set — skipping integration test")
	}
}

// --- Per-Endpoint Integration Tests ---

func TestPersonaEndpoint_Integration(t *testing.T) {
	skipIfNoAPIKey(t)
	srv := newTestServer()
	defer srv.Close()

	dataLines := postSSE(t, srv.URL, "/api/persona", `{"rawInput":"junior designer at a SaaS company"}`)
	finalLine := extractFinalJSON(t, dataLines)

	var persona struct {
		Label        string   `json:"label"`
		Role         string   `json:"role"`
		Goals        []string `json:"goals"`
		Frustrations []string `json:"frustrations"`
		Context      string   `json:"context"`
		Influencers  []string `json:"influencers"`
	}
	if err := json.Unmarshal([]byte(finalLine), &persona); err != nil {
		t.Fatalf("final event is not valid JSON: %v\nraw: %s", err, finalLine)
	}

	if persona.Label == "" {
		t.Error("final Persona.label is empty")
	}
	if persona.Role == "" {
		t.Error("final Persona.role is empty")
	}
	if len(persona.Goals) == 0 {
		t.Error("final Persona.goals is empty")
	}
	if len(persona.Frustrations) == 0 {
		t.Error("final Persona.frustrations is empty")
	}
	if persona.Context == "" {
		t.Error("final Persona.context is empty")
	}
	if len(persona.Influencers) == 0 {
		t.Error("final Persona.influencers is empty")
	}

	if len(dataLines) > 2 {
		var partial map[string]interface{}
		if err := json.Unmarshal([]byte(dataLines[0]), &partial); err != nil {
			t.Errorf("first partial event is not valid JSON: %v\nraw: %s", err, dataLines[0])
		}
	}

	t.Logf("Received %d SSE data events (including [DONE])", len(dataLines))
	t.Logf("Final persona: label=%q role=%q goals=%d frustrations=%d influencers=%d",
		persona.Label, persona.Role, len(persona.Goals), len(persona.Frustrations), len(persona.Influencers))
}

func TestAnalyzeEndpoint_Integration(t *testing.T) {
	skipIfNoAPIKey(t)
	srv := newTestServer()
	defer srv.Close()

	body := `{
		"statement": "How might we make workshops more productive?",
		"context": {
			"domain": "design",
			"persona": {
				"label": "Junior Designer",
				"role": "UX Designer at a mid-size SaaS company",
				"goals": ["improve facilitation skills", "run effective workshops"],
				"frustrations": ["workshops feel unproductive", "hard to keep participants engaged"],
				"context": "Works at a SaaS company, responsible for running design thinking workshops",
				"influencers": ["senior designers", "product managers"]
			},
			"constraints": [
				{"statement": "workshops are limited to 1 hour", "type": "hard"},
				{"statement": "remote participants must be included", "type": "soft"}
			]
		}
	}`

	dataLines := postSSE(t, srv.URL, "/api/analyze", body)
	finalLine := extractFinalJSON(t, dataLines)

	var analysis struct {
		OriginalStatement   string   `json:"originalStatement"`
		ImplicitUser        string   `json:"implicitUser"`
		EmbeddedAssumptions []string `json:"embeddedAssumptions"`
		ScopeLevel          string   `json:"scopeLevel"`
		UnderlyingTension   string   `json:"underlyingTension"`
		InitialReframing    string   `json:"initialReframing"`
	}
	if err := json.Unmarshal([]byte(finalLine), &analysis); err != nil {
		t.Fatalf("final event is not valid JSON: %v\nraw: %s", err, finalLine)
	}

	if analysis.OriginalStatement == "" {
		t.Error("final HMWAnalysis.originalStatement is empty")
	}
	if analysis.ImplicitUser == "" {
		t.Error("final HMWAnalysis.implicitUser is empty")
	}
	if len(analysis.EmbeddedAssumptions) == 0 {
		t.Error("final HMWAnalysis.embeddedAssumptions is empty")
	}
	if analysis.ScopeLevel == "" {
		t.Error("final HMWAnalysis.scopeLevel is empty")
	}
	if analysis.UnderlyingTension == "" {
		t.Error("final HMWAnalysis.underlyingTension is empty")
	}
	if analysis.InitialReframing == "" {
		t.Error("final HMWAnalysis.initialReframing is empty")
	}

	if len(dataLines) > 2 {
		var partial map[string]interface{}
		if err := json.Unmarshal([]byte(dataLines[0]), &partial); err != nil {
			t.Errorf("first partial event is not valid JSON: %v\nraw: %s", err, dataLines[0])
		}
	}

	t.Logf("Received %d SSE data events (including [DONE])", len(dataLines))
	t.Logf("Final analysis: implicitUser=%q scopeLevel=%q assumptions=%d",
		analysis.ImplicitUser, analysis.ScopeLevel, len(analysis.EmbeddedAssumptions))
}

func TestExpandEndpoint_Integration(t *testing.T) {
	skipIfNoAPIKey(t)
	srv := newTestServer()
	defer srv.Close()

	body := `{
		"analysis": {
			"originalStatement": "How might we make workshops more productive?",
			"implicitUser": "Workshop facilitator (likely the designer themselves)",
			"embeddedAssumptions": [
				"Workshops are currently unproductive",
				"Productivity is the right measure",
				"The problem is the workshop format, not what happens before/after"
			],
			"scopeLevel": "too_broad",
			"underlyingTension": "The facilitator needs to appear competent while learning on the job — the real problem may be confidence in the process, not the process itself.",
			"initialReframing": "How might we help junior facilitators feel confident that their HMW questions will generate useful ideation?"
		},
		"context": {
			"domain": "design",
			"persona": {
				"label": "Junior Designer",
				"role": "UX Designer at a mid-size SaaS company",
				"goals": ["improve facilitation skills", "run effective workshops"],
				"frustrations": ["workshops feel unproductive", "hard to keep participants engaged"],
				"context": "Works at a SaaS company, responsible for running design thinking workshops",
				"influencers": ["senior designers", "product managers"]
			},
			"constraints": [
				{"statement": "workshops are limited to 1 hour", "type": "hard"},
				{"statement": "remote participants must be included", "type": "soft"}
			]
		}
	}`

	dataLines := postSSE(t, srv.URL, "/api/expand", body)
	finalLine := extractFinalJSON(t, dataLines)

	var expansion struct {
		Variants []struct {
			Statement string `json:"statement"`
			MoveType  string `json:"moveType"`
			Rationale string `json:"rationale"`
		} `json:"variants"`
		EmergentTheme *string `json:"emergentTheme"`
	}
	if err := json.Unmarshal([]byte(finalLine), &expansion); err != nil {
		t.Fatalf("final event is not valid JSON: %v\nraw: %s", err, finalLine)
	}

	if len(expansion.Variants) == 0 {
		t.Fatal("final HMWExpansion.variants is empty")
	}

	for i, v := range expansion.Variants {
		if v.Statement == "" {
			t.Errorf("variant[%d].statement is empty", i)
		}
		if v.MoveType == "" {
			t.Errorf("variant[%d].moveType is empty", i)
		}
		if v.Rationale == "" {
			t.Errorf("variant[%d].rationale is empty", i)
		}
	}

	if expansion.EmergentTheme == nil || *expansion.EmergentTheme == "" {
		t.Error("final HMWExpansion.emergentTheme is empty")
	}

	if len(dataLines) > 2 {
		var partial map[string]interface{}
		if err := json.Unmarshal([]byte(dataLines[0]), &partial); err != nil {
			t.Errorf("first partial event is not valid JSON: %v\nraw: %s", err, dataLines[0])
		}
	}

	t.Logf("Received %d SSE data events (including [DONE])", len(dataLines))
	t.Logf("Final expansion: variants=%d emergentTheme=%v",
		len(expansion.Variants), expansion.EmergentTheme != nil)
}

func TestRefineEndpoint_Integration(t *testing.T) {
	skipIfNoAPIKey(t)
	srv := newTestServer()
	defer srv.Close()

	body := `{
		"session": {
			"context": {
				"domain": "design",
				"persona": {
					"label": "Junior Designer",
					"role": "UX Designer at a mid-size SaaS company",
					"goals": ["improve facilitation skills", "run effective workshops"],
					"frustrations": ["workshops feel unproductive", "hard to keep participants engaged"],
					"context": "Works at a SaaS company, responsible for running design thinking workshops",
					"influencers": ["senior designers", "product managers"]
				},
				"constraints": [
					{"statement": "workshops are limited to 1 hour", "type": "hard"},
					{"statement": "remote participants must be included", "type": "soft"}
				]
			},
			"analysis": {
				"originalStatement": "How might we make workshops more productive?",
				"implicitUser": "Workshop facilitator",
				"embeddedAssumptions": ["Workshops are currently unproductive"],
				"scopeLevel": "too_broad",
				"underlyingTension": "The facilitator needs to appear competent while learning on the job.",
				"initialReframing": "How might we help junior facilitators feel confident?"
			},
			"candidates": [
				{
					"id": "c1",
					"variant": {
						"statement": "How might we help junior facilitators build confidence in their HMW question framing?",
						"moveType": "narrowed",
						"rationale": "Focuses on the specific skill gap rather than general productivity"
					},
					"status": "SELECTED"
				},
				{
					"id": "c2",
					"variant": {
						"statement": "How might we redesign the workshop format to be self-correcting?",
						"moveType": "reframed_constraint",
						"rationale": "Shifts from facilitator skill to systemic design"
					},
					"status": "SKIPPED"
				},
				{
					"id": "c3",
					"variant": {
						"statement": "How might we make the quality of HMW questions visible to participants in real time?",
						"moveType": "shifted_user",
						"rationale": "Distributes responsibility for question quality"
					},
					"status": "EDITED",
					"userEdits": "How might we give facilitators real-time signals about HMW question quality?"
				}
			],
			"clippedIds": [],
			"iterationCount": 1
		}
	}`

	dataLines := postSSE(t, srv.URL, "/api/refine", body)
	finalLine := extractFinalJSON(t, dataLines)

	var refinement struct {
		NewVariants []struct {
			Statement string `json:"statement"`
			MoveType  string `json:"moveType"`
			Rationale string `json:"rationale"`
		} `json:"newVariants"`
		Tensions          []string `json:"tensions"`
		Recommendation    *string  `json:"recommendation"`
		SuggestedNextMove *string  `json:"suggestedNextMove"`
	}
	if err := json.Unmarshal([]byte(finalLine), &refinement); err != nil {
		t.Fatalf("final event is not valid JSON: %v\nraw: %s", err, finalLine)
	}

	if len(refinement.NewVariants) == 0 {
		t.Fatal("final HMWRefinement.newVariants is empty")
	}

	for i, v := range refinement.NewVariants {
		if v.Statement == "" {
			t.Errorf("newVariants[%d].statement is empty", i)
		}
		if v.MoveType == "" {
			t.Errorf("newVariants[%d].moveType is empty", i)
		}
		if v.Rationale == "" {
			t.Errorf("newVariants[%d].rationale is empty", i)
		}
	}

	if len(refinement.Tensions) == 0 {
		t.Error("final HMWRefinement.tensions is empty")
	}

	if refinement.SuggestedNextMove == nil || *refinement.SuggestedNextMove == "" {
		t.Error("final HMWRefinement.suggestedNextMove is empty")
	}

	if len(dataLines) > 2 {
		var partial map[string]interface{}
		if err := json.Unmarshal([]byte(dataLines[0]), &partial); err != nil {
			t.Errorf("first partial event is not valid JSON: %v\nraw: %s", err, dataLines[0])
		}
	}

	t.Logf("Received %d SSE data events (including [DONE])", len(dataLines))
	t.Logf("Final refinement: newVariants=%d tensions=%d suggestedNextMove=%v",
		len(refinement.NewVariants), len(refinement.Tensions), refinement.SuggestedNextMove != nil)
}

// --- Full Pipeline Integration Test ---

func TestFullPipeline_Integration(t *testing.T) {
	skipIfNoAPIKey(t)
	srv := newTestServer()
	defer srv.Close()

	// Stage 1: Persona
	t.Log("=== Stage 1: RefinePersona ===")
	personaLines := postSSE(t, srv.URL, "/api/persona", `{"rawInput":"junior designer at a SaaS company who runs workshops"}`)
	personaJSON := extractFinalJSON(t, personaLines)

	var persona struct {
		Label        string   `json:"label"`
		Role         string   `json:"role"`
		Goals        []string `json:"goals"`
		Frustrations []string `json:"frustrations"`
		Context      string   `json:"context"`
		Influencers  []string `json:"influencers"`
	}
	if err := json.Unmarshal([]byte(personaJSON), &persona); err != nil {
		t.Fatalf("Stage 1: failed to unmarshal persona: %v\nraw: %s", err, personaJSON)
	}
	if persona.Label == "" || persona.Role == "" {
		t.Fatalf("Stage 1: persona missing required fields: label=%q role=%q", persona.Label, persona.Role)
	}
	t.Logf("Stage 1 complete: label=%q role=%q (%d SSE events)", persona.Label, persona.Role, len(personaLines))

	// Stage 2: Analyze
	// Build ProblemContext from the persona returned by Stage 1
	t.Log("=== Stage 2: AnalyzeHMW ===")
	analyzeReq := map[string]interface{}{
		"statement": "How might we make workshops more productive?",
		"context": map[string]interface{}{
			"domain":  "design",
			"persona": persona,
			"constraints": []map[string]interface{}{
				{"statement": "workshops are limited to 1 hour", "type": "hard"},
				{"statement": "remote participants must be included", "type": "soft"},
			},
		},
	}
	analyzeBody, err := json.Marshal(analyzeReq)
	if err != nil {
		t.Fatalf("Stage 2: failed to marshal request: %v", err)
	}

	analyzeLines := postSSE(t, srv.URL, "/api/analyze", string(analyzeBody))
	analysisJSON := extractFinalJSON(t, analyzeLines)

	var analysis struct {
		OriginalStatement   string   `json:"originalStatement"`
		ImplicitUser        string   `json:"implicitUser"`
		EmbeddedAssumptions []string `json:"embeddedAssumptions"`
		ScopeLevel          string   `json:"scopeLevel"`
		SolutionBias        *string  `json:"solutionBias"`
		UnderlyingTension   string   `json:"underlyingTension"`
		InitialReframing    string   `json:"initialReframing"`
	}
	if err := json.Unmarshal([]byte(analysisJSON), &analysis); err != nil {
		t.Fatalf("Stage 2: failed to unmarshal analysis: %v\nraw: %s", err, analysisJSON)
	}
	if analysis.OriginalStatement == "" || analysis.UnderlyingTension == "" {
		t.Fatalf("Stage 2: analysis missing required fields: originalStatement=%q underlyingTension=%q",
			analysis.OriginalStatement, analysis.UnderlyingTension)
	}
	t.Logf("Stage 2 complete: scopeLevel=%q assumptions=%d (%d SSE events)",
		analysis.ScopeLevel, len(analysis.EmbeddedAssumptions), len(analyzeLines))

	// Stage 3: Expand
	// Pass the real analysis from Stage 2 and the same context
	t.Log("=== Stage 3: ExpandHMW ===")
	expandReq := map[string]interface{}{
		"analysis": analysis,
		"context":  analyzeReq["context"],
	}
	expandBody, err := json.Marshal(expandReq)
	if err != nil {
		t.Fatalf("Stage 3: failed to marshal request: %v", err)
	}

	expandLines := postSSE(t, srv.URL, "/api/expand", string(expandBody))
	expansionJSON := extractFinalJSON(t, expandLines)

	var expansion struct {
		Variants []struct {
			Statement string `json:"statement"`
			MoveType  string `json:"moveType"`
			Rationale string `json:"rationale"`
		} `json:"variants"`
		EmergentTheme *string `json:"emergentTheme"`
	}
	if err := json.Unmarshal([]byte(expansionJSON), &expansion); err != nil {
		t.Fatalf("Stage 3: failed to unmarshal expansion: %v\nraw: %s", err, expansionJSON)
	}
	if len(expansion.Variants) == 0 {
		t.Fatalf("Stage 3: expansion has no variants")
	}
	for i, v := range expansion.Variants {
		if v.Statement == "" || v.MoveType == "" {
			t.Fatalf("Stage 3: variant[%d] missing fields: statement=%q moveType=%q", i, v.Statement, v.MoveType)
		}
	}
	t.Logf("Stage 3 complete: %d variants (%d SSE events)", len(expansion.Variants), len(expandLines))

	// Stage 4: Refine
	// Build HMWSession from all prior outputs. Assign candidate statuses to simulate user curation.
	t.Log("=== Stage 4: RefineHMW ===")
	candidates := make([]map[string]interface{}, 0, len(expansion.Variants))
	for i, v := range expansion.Variants {
		status := "SELECTED"
		var candidate map[string]interface{}
		if i == 0 {
			status = "SELECTED"
			candidate = map[string]interface{}{
				"id":      fmt.Sprintf("c%d", i+1),
				"variant": v,
				"status":  status,
			}
		} else if i == 1 {
			status = "EDITED"
			candidate = map[string]interface{}{
				"id":        fmt.Sprintf("c%d", i+1),
				"variant":   v,
				"status":    status,
				"userEdits": "How might we help designers feel confident about their workshop questions?",
			}
		} else if i == 2 {
			status = "SKIPPED"
			candidate = map[string]interface{}{
				"id":      fmt.Sprintf("c%d", i+1),
				"variant": v,
				"status":  status,
			}
		} else {
			status = "GENERATED"
			candidate = map[string]interface{}{
				"id":      fmt.Sprintf("c%d", i+1),
				"variant": v,
				"status":  status,
			}
		}
		candidates = append(candidates, candidate)
	}

	refineReq := map[string]interface{}{
		"session": map[string]interface{}{
			"context":        analyzeReq["context"],
			"analysis":       analysis,
			"candidates":     candidates,
			"clippedIds":     []string{},
			"iterationCount": 1,
		},
	}
	refineBody, err := json.Marshal(refineReq)
	if err != nil {
		t.Fatalf("Stage 4: failed to marshal request: %v", err)
	}

	refineLines := postSSE(t, srv.URL, "/api/refine", string(refineBody))
	refinementJSON := extractFinalJSON(t, refineLines)

	var refinement struct {
		NewVariants []struct {
			Statement string `json:"statement"`
			MoveType  string `json:"moveType"`
			Rationale string `json:"rationale"`
		} `json:"newVariants"`
		Tensions          []string `json:"tensions"`
		Recommendation    *string  `json:"recommendation"`
		SuggestedNextMove *string  `json:"suggestedNextMove"`
	}
	if err := json.Unmarshal([]byte(refinementJSON), &refinement); err != nil {
		t.Fatalf("Stage 4: failed to unmarshal refinement: %v\nraw: %s", err, refinementJSON)
	}
	if len(refinement.NewVariants) == 0 {
		t.Fatalf("Stage 4: refinement has no newVariants")
	}
	for i, v := range refinement.NewVariants {
		if v.Statement == "" || v.MoveType == "" {
			t.Fatalf("Stage 4: newVariants[%d] missing fields: statement=%q moveType=%q", i, v.Statement, v.MoveType)
		}
	}
	if len(refinement.Tensions) == 0 {
		t.Error("Stage 4: refinement.tensions is empty")
	}

	t.Logf("Stage 4 complete: %d newVariants, %d tensions (%d SSE events)",
		len(refinement.NewVariants), len(refinement.Tensions), len(refineLines))

	// Pipeline Summary
	t.Log("=== Pipeline Complete ===")
	t.Logf("Persona: %q → Analysis: scopeLevel=%q → Expansion: %d variants → Refinement: %d new variants",
		persona.Label, analysis.ScopeLevel, len(expansion.Variants), len(refinement.NewVariants))
}

// --- Error Handling Integration Tests ---

func TestErrorHandling_Integration(t *testing.T) {
	srv := newTestServer()
	defer srv.Close()

	// Helper to POST and expect a specific status code with a JSON error body
	expectError := func(t *testing.T, path, body string, wantStatus int, wantContains string) {
		t.Helper()
		resp, err := http.Post(srv.URL+path, "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("POST %s failed: %v", path, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != wantStatus {
			b, _ := io.ReadAll(resp.Body)
			t.Fatalf("POST %s: expected %d, got %d: %s", path, wantStatus, resp.StatusCode, string(b))
		}

		ct := resp.Header.Get("Content-Type")
		if !strings.HasPrefix(ct, "application/json") {
			t.Errorf("POST %s error response Content-Type = %q, want application/json", path, ct)
		}

		if wantContains != "" {
			b, _ := io.ReadAll(resp.Body)
			if !strings.Contains(string(b), wantContains) {
				t.Errorf("POST %s error body = %q, want it to contain %q", path, string(b), wantContains)
			}
		}
	}

	t.Run("persona/invalid_json", func(t *testing.T) {
		expectError(t, "/api/persona", "{bad", http.StatusBadRequest, "invalid JSON")
	})
	t.Run("persona/missing_rawInput", func(t *testing.T) {
		expectError(t, "/api/persona", `{"rawInput":""}`, http.StatusBadRequest, "rawInput is required")
	})

	t.Run("analyze/invalid_json", func(t *testing.T) {
		expectError(t, "/api/analyze", "{bad", http.StatusBadRequest, "invalid JSON")
	})
	t.Run("analyze/missing_statement", func(t *testing.T) {
		expectError(t, "/api/analyze", `{"statement":"","context":{"domain":"d","persona":{"label":"L","role":"R","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`, http.StatusBadRequest, "statement is required")
	})
	t.Run("analyze/missing_domain", func(t *testing.T) {
		expectError(t, "/api/analyze", `{"statement":"test","context":{"domain":"","persona":{"label":"L","role":"R","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`, http.StatusBadRequest, "context.domain is required")
	})
	t.Run("analyze/missing_persona_label", func(t *testing.T) {
		expectError(t, "/api/analyze", `{"statement":"test","context":{"domain":"d","persona":{"label":"","role":"R","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`, http.StatusBadRequest, "context.persona.label is required")
	})

	t.Run("expand/invalid_json", func(t *testing.T) {
		expectError(t, "/api/expand", "{bad", http.StatusBadRequest, "invalid JSON")
	})
	t.Run("expand/missing_originalStatement", func(t *testing.T) {
		expectError(t, "/api/expand", `{"analysis":{"originalStatement":"","implicitUser":"u","embeddedAssumptions":[],"scopeLevel":"well_scoped","underlyingTension":"t","initialReframing":"r"},"context":{"domain":"d","persona":{"label":"L","role":"R","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`, http.StatusBadRequest, "analysis.originalStatement is required")
	})
	t.Run("expand/missing_underlyingTension", func(t *testing.T) {
		expectError(t, "/api/expand", `{"analysis":{"originalStatement":"s","implicitUser":"u","embeddedAssumptions":[],"scopeLevel":"well_scoped","underlyingTension":"","initialReframing":"r"},"context":{"domain":"d","persona":{"label":"L","role":"R","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}}`, http.StatusBadRequest, "analysis.underlyingTension is required")
	})

	t.Run("refine/invalid_json", func(t *testing.T) {
		expectError(t, "/api/refine", "{bad", http.StatusBadRequest, "invalid JSON")
	})
	t.Run("refine/missing_domain", func(t *testing.T) {
		expectError(t, "/api/refine", `{"session":{"context":{"domain":"","persona":{"label":"L","role":"R","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]},"candidates":[{"id":"c1","variant":{"statement":"s","moveType":"narrowed","rationale":"r"},"status":"SELECTED"}],"clippedIds":[],"iterationCount":1}}`, http.StatusBadRequest, "session.context.domain is required")
	})
	t.Run("refine/empty_candidates", func(t *testing.T) {
		expectError(t, "/api/refine", `{"session":{"context":{"domain":"d","persona":{"label":"L","role":"R","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]},"candidates":[],"clippedIds":[],"iterationCount":1}}`, http.StatusBadRequest, "session.candidates must not be empty")
	})

	t.Run("cors/preflight", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/persona", nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("OPTIONS failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusNoContent {
			t.Errorf("OPTIONS: expected 204, got %d", resp.StatusCode)
		}
		if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
			t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, "*")
		}
		if got := resp.Header.Get("Access-Control-Allow-Methods"); got != "POST, OPTIONS" {
			t.Errorf("Access-Control-Allow-Methods = %q, want %q", got, "POST, OPTIONS")
		}
		if got := resp.Header.Get("Access-Control-Allow-Headers"); got != "Content-Type" {
			t.Errorf("Access-Control-Allow-Headers = %q, want %q", got, "Content-Type")
		}
	})
}
