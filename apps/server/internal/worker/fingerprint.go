package worker

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
)

// These patterns are compiled once at package init. Each strips a category of
// variable token from an error message so that messages that differ only in
// runtime values (IDs, line numbers, quoted strings) produce the same fingerprint.
var (
	// UUIDs (8-4-4-4-12 hex groups, optionally braced).
	reUUID = regexp.MustCompile(
		`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`,
	)
	// Hex strings ≥ 6 chars (0x-prefixed or bare), e.g. memory addresses, hashes.
	reHex = regexp.MustCompile(`\b(?:0x)?[0-9a-fA-F]{6,}\b`)
	// Standalone numbers ≥ 4 digits (shorter numbers, e.g. HTTP status codes, are kept).
	reNumber = regexp.MustCompile(`\b\d{4,}\b`)
	// Single- or double-quoted strings. Removed to collapse messages like
	// "Cannot read 'foo'" and "Cannot read 'bar'" into the same bucket.
	reQuoted = regexp.MustCompile(`(?:"[^"]*"|'[^']*')`)
	// Collapse runs of whitespace introduced by the replacements above.
	reSpace = regexp.MustCompile(`\s{2,}`)
)

// normalizeMessage strips variable tokens from an error message so that
// messages differing only in runtime values group into the same fingerprint.
func normalizeMessage(msg string) string {
	s := reUUID.ReplaceAllString(msg, "UUID")
	s = reHex.ReplaceAllString(s, "0xHEX")
	s = reNumber.ReplaceAllString(s, "N")
	s = reQuoted.ReplaceAllString(s, "STR")
	s = reSpace.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// FingerprintError produces a stable 16-hex-char identifier for a frontend
// error. The same error name + similar message + same route always produce the
// same fingerprint, even if the message contains variable IDs or line numbers.
//
// The fingerprint is the first 8 bytes (16 hex chars) of SHA-256 over:
//
//	"<name>|<normalizedMessage>|<route>"
//
// Collision probability at 2^32 events is negligible for a single project.
func FingerprintError(name, message, route string) string {
	normalized := normalizeMessage(message)
	key := name + "|" + normalized + "|" + route
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:8])
}
