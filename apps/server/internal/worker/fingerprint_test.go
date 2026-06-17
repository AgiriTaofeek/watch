package worker

import (
	"testing"
)

func TestFingerprintError_StableForSameInput(t *testing.T) {
	fp1 := FingerprintError("TypeError", "Cannot read property 'foo' of undefined", "/users/:id")
	fp2 := FingerprintError("TypeError", "Cannot read property 'foo' of undefined", "/users/:id")
	if fp1 != fp2 {
		t.Fatalf("expected same fingerprint for identical input, got %q and %q", fp1, fp2)
	}
}

func TestFingerprintError_DifferentNamesProduceDifferentFingerprints(t *testing.T) {
	fp1 := FingerprintError("TypeError", "something went wrong", "/")
	fp2 := FingerprintError("RangeError", "something went wrong", "/")
	if fp1 == fp2 {
		t.Fatal("expected different fingerprints for different error names")
	}
}

func TestFingerprintError_DifferentRoutesProduceDifferentFingerprints(t *testing.T) {
	fp1 := FingerprintError("Error", "boom", "/users/:id")
	fp2 := FingerprintError("Error", "boom", "/settings")
	if fp1 == fp2 {
		t.Fatal("expected different fingerprints for different routes")
	}
}

func TestFingerprintError_NormalizesNumbersInMessage(t *testing.T) {
	// Messages that differ only in a large number (e.g. line number or ID) should
	// produce the same fingerprint.
	fp1 := FingerprintError("Error", "Failed at line 1024", "/")
	fp2 := FingerprintError("Error", "Failed at line 9999", "/")
	if fp1 != fp2 {
		t.Fatalf("expected same fingerprint when only large number differs: %q vs %q", fp1, fp2)
	}
}

func TestFingerprintError_NormalizesUUIDsInMessage(t *testing.T) {
	fp1 := FingerprintError("Error", "Not found: 550e8400-e29b-41d4-a716-446655440000", "/")
	fp2 := FingerprintError("Error", "Not found: 6ba7b810-9dad-11d1-80b4-00c04fd430c8", "/")
	if fp1 != fp2 {
		t.Fatalf("expected same fingerprint when only UUID differs: %q vs %q", fp1, fp2)
	}
}

func TestFingerprintError_NormalizesQuotedStrings(t *testing.T) {
	fp1 := FingerprintError("TypeError", "Cannot read property 'foo' of undefined", "/")
	fp2 := FingerprintError("TypeError", "Cannot read property 'bar' of undefined", "/")
	if fp1 != fp2 {
		t.Fatalf("expected same fingerprint when only quoted property name differs: %q vs %q", fp1, fp2)
	}
}

func TestFingerprintError_DifferentCoreMessagesDiffer(t *testing.T) {
	fp1 := FingerprintError("TypeError", "Cannot read property 'x' of undefined", "/")
	fp2 := FingerprintError("TypeError", "is not a function", "/")
	if fp1 == fp2 {
		t.Fatal("expected different fingerprints for structurally different messages")
	}
}

func TestFingerprintError_OutputIs16HexChars(t *testing.T) {
	fp := FingerprintError("Error", "boom", "/")
	if len(fp) != 16 {
		t.Fatalf("expected 16-char hex fingerprint, got %q (len %d)", fp, len(fp))
	}
	for _, c := range fp {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Fatalf("expected lowercase hex fingerprint, got %q", fp)
		}
	}
}

func TestNormalizeMessage(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{
			input: "Failed at line 2048 with code 0xDEADBEEF",
			want:  "Failed at line N with code 0xHEX",
		},
		{
			input: "Object 550e8400-e29b-41d4-a716-446655440000 not found",
			want:  "Object UUID not found",
		},
		{
			input: "Cannot read property 'foo' of null",
			want:  "Cannot read property STR of null",
		},
		{
			// Short numbers (< 4 digits) are kept — they're less likely to be variable IDs.
			input: "Expected 3 arguments",
			want:  "Expected 3 arguments",
		},
	}

	for _, tc := range cases {
		got := normalizeMessage(tc.input)
		if got != tc.want {
			t.Errorf("normalizeMessage(%q)\n  got  %q\n  want %q", tc.input, got, tc.want)
		}
	}
}
