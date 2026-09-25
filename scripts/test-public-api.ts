import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { GET as getFilters, OPTIONS as optionsFilters } from "../src/app/api/public/certificates/filters/route";
import { GET as getSearch } from "../src/app/api/public/certificates/search/route";
import { GET as getCertificate } from "../src/app/api/public/certificates/[certificateId]/route";
import { GET as getDownload } from "../src/app/api/public/certificates/[certificateId]/download/route";
import { GET as getVerify } from "../src/app/api/public/certificates/verify/[certificateId]/route";
import { GET as getCRedirect } from "../src/app/c/[certificateId]/route";

async function runTests() {
  console.log("=== Starting EnCertify Public API Tests ===\n");

  // Fetch a known valid certificate to test with
  const sampleCert = await prisma.certificate.findFirst({
    where: { status: "VALID" },
    include: { event: true }
  });

  if (!sampleCert) {
    throw new Error("No sample valid certificate found in database for testing.");
  }

  console.log(`Using sample certificate: ${sampleCert.certificateId} (${sampleCert.participantName})`);

  // 1. Test GET /api/public/certificates/filters
  console.log("\n1. Testing GET /api/public/certificates/filters...");
  const filtersReq = new NextRequest("http://localhost:3000/api/public/certificates/filters", {
    headers: { origin: "https://encypherist.online" }
  });
  const filtersRes = await getFilters(filtersReq);
  const filtersJson = await filtersRes.json();
  console.log("Filters response status:", filtersRes.status);
  console.log("Filters CORS header:", filtersRes.headers.get("access-control-allow-origin"));
  console.log("Filters Cache-Control:", filtersRes.headers.get("cache-control"));
  console.log("Events count:", filtersJson.events?.length);
  console.log("Semesters array:", JSON.stringify(filtersJson.semesters));
  if (!Array.isArray(filtersJson.events) || !Array.isArray(filtersJson.semesters)) {
    throw new Error("Filters failed: invalid shape");
  }
  if (filtersRes.headers.get("access-control-allow-origin") !== "https://encypherist.online") {
    throw new Error("Filters failed: CORS origin header missing or wrong");
  }

  // 2. Test GET /api/public/certificates/search with partial name
  console.log("\n2. Testing GET /api/public/certificates/search with partial name...");
  const partialName = sampleCert.participantName.slice(0, 4).toLowerCase();
  const searchNameReq = new NextRequest(
    `http://localhost:3000/api/public/certificates/search?q=${encodeURIComponent(partialName)}`,
    { headers: { origin: "https://www.encypherist.online" } }
  );
  const searchNameRes = await getSearch(searchNameReq);
  const searchNameJson = await searchNameRes.json();
  console.log(`Search by partial name "${partialName}" status:`, searchNameRes.status);
  console.log("Results found:", searchNameJson.total);
  console.log("Sample result:", searchNameJson.results?.[0]);
  if (!searchNameJson.results?.some((r: any) => r.certificateId === sampleCert.certificateId)) {
    throw new Error("Search by partial name failed to find certificate");
  }
  // Check privacy and semester
  if ("participantEmail" in searchNameJson.results[0] || "email" in searchNameJson.results[0]) {
    throw new Error("Search leaked email address!");
  }
  if (searchNameJson.results[0].semester !== null) {
    throw new Error(`Expected semester to be null, got ${searchNameJson.results[0].semester}`);
  }

  // 2b. Test GET /api/public/certificates/search with semester filter
  console.log("\n2b. Testing GET /api/public/certificates/search with semester filter...");
  const searchSemesterReq = new NextRequest(
    `http://localhost:3000/api/public/certificates/search?q=${encodeURIComponent(partialName)}&semester=Semester+1`
  );
  const searchSemesterRes = await getSearch(searchSemesterReq);
  const searchSemesterJson = await searchSemesterRes.json();
  console.log("Search with non-existent semester count:", searchSemesterJson.total);
  if (searchSemesterJson.total !== 0 || searchSemesterJson.results.length !== 0) {
    throw new Error("Search with unmatched semester filter should exclude records lacking it");
  }

  // 3. Test GET /api/public/certificates/search with partial certificate ID
  console.log("\n3. Testing GET /api/public/certificates/search with partial ID...");
  const partialId = sampleCert.certificateId.slice(-5);
  const searchIdReq = new NextRequest(
    `http://localhost:3000/api/public/certificates/search?q=${encodeURIComponent(partialId)}`
  );
  const searchIdRes = await getSearch(searchIdReq);
  const searchIdJson = await searchIdRes.json();
  console.log(`Search by partial ID "${partialId}" status:`, searchIdRes.status);
  console.log("Results found:", searchIdJson.total);
  if (!searchIdJson.results?.some((r: any) => r.certificateId === sampleCert.certificateId)) {
    throw new Error("Search by partial ID failed to find certificate");
  }

  // 4. Test GET /api/public/certificates/search validation (q < 3 chars)
  console.log("\n4. Testing GET /api/public/certificates/search with < 3 characters (expect 400)...");
  const shortSearchReq = new NextRequest("http://localhost:3000/api/public/certificates/search?q=ab");
  const shortSearchRes = await getSearch(shortSearchReq);
  const shortSearchJson = await shortSearchRes.json();
  console.log("Short query response status:", shortSearchRes.status);
  console.log("Short query error:", shortSearchJson.error);
  if (shortSearchRes.status !== 400) {
    throw new Error("Expected 400 for q < 3 chars");
  }

  // 5. Test non-existent ID
  console.log("\n5. Testing non-existent ID...");
  const nonExistentId = "CERT-9999-NOTFOUND";
  const verifyNotFoundReq = new NextRequest(`http://localhost:3000/api/public/certificates/verify/${nonExistentId}`);
  const verifyNotFoundRes = await getVerify(verifyNotFoundReq, { params: { certificateId: nonExistentId } });
  const verifyNotFoundJson = await verifyNotFoundRes.json();
  console.log("Verify non-existent status:", verifyNotFoundRes.status);
  console.log("Verify non-existent body:", verifyNotFoundJson);
  if (verifyNotFoundRes.status !== 404 || verifyNotFoundJson.status !== "not_found" || "certificate" in verifyNotFoundJson) {
    throw new Error("Verify non-existent failed contract: must return 404 with status 'not_found' and NO certificate object");
  }

  const certNotFoundReq = new NextRequest(`http://localhost:3000/api/public/certificates/${nonExistentId}`);
  const certNotFoundRes = await getCertificate(certNotFoundReq, { params: { certificateId: nonExistentId } });
  console.log("Single cert non-existent status:", certNotFoundRes.status);
  if (certNotFoundRes.status !== 404) {
    throw new Error("Single cert non-existent must return 404");
  }

  const downloadNotFoundReq = new NextRequest(`http://localhost:3000/api/public/certificates/${nonExistentId}/download`);
  const downloadNotFoundRes = await getDownload(downloadNotFoundReq, { params: { certificateId: nonExistentId } });
  console.log("Download non-existent status:", downloadNotFoundRes.status);
  if (downloadNotFoundRes.status !== 404) {
    throw new Error("Download non-existent must return 404");
  }

  // 6. Test Revoked certificate lifecycle
  console.log("\n6. Testing Revoked certificate behavior...");
  // Create a temporary test certificate to avoid altering real data
  const testRevokedCert = await prisma.certificate.create({
    data: {
      certificateId: "CERT-TEST-REVOKED-XYZ",
      participantName: "Test Revoked User",
      participantNameNormalized: "test revoked user",
      eventId: sampleCert.eventId,
      templateId: sampleCert.templateId,
      fileUrl: sampleCert.fileUrl,
      issueDate: new Date(),
      status: "REVOKED"
    },
    include: { event: true }
  });

  try {
    // 6a. Verify revoked certificate
    const verifyRevokedReq = new NextRequest(
      `http://localhost:3000/api/public/certificates/verify/${testRevokedCert.certificateId}`
    );
    const verifyRevokedRes = await getVerify(verifyRevokedReq, {
      params: { certificateId: testRevokedCert.certificateId }
    });
    const verifyRevokedJson = await verifyRevokedRes.json();
    console.log("Verify revoked status:", verifyRevokedRes.status);
    console.log("Verify revoked body:", verifyRevokedJson);
    if (verifyRevokedJson.status !== "revoked") {
      throw new Error("Expected verify status to be 'revoked'");
    }
    if (verifyRevokedJson.certificate?.certificateId !== testRevokedCert.certificateId) {
      throw new Error("Expected verify certificate object to match");
    }

    // 6b. Search revoked certificate
    const searchRevokedReq = new NextRequest(
      `http://localhost:3000/api/public/certificates/search?q=REVOKED-XYZ`
    );
    const searchRevokedRes = await getSearch(searchRevokedReq);
    const searchRevokedJson = await searchRevokedRes.json();
    console.log("Search revoked count:", searchRevokedJson.total);
    console.log("Search revoked result status:", searchRevokedJson.results?.[0]?.status);
    if (searchRevokedJson.results?.[0]?.status !== "revoked") {
      throw new Error("Expected search result status to be 'revoked'");
    }

    // 6c. Download revoked certificate (Must return 410 Gone)
    const downloadRevokedReq = new NextRequest(
      `http://localhost:3000/api/public/certificates/${testRevokedCert.certificateId}/download`
    );
    const downloadRevokedRes = await getDownload(downloadRevokedReq, {
      params: { certificateId: testRevokedCert.certificateId }
    });
    console.log("Download revoked HTTP status:", downloadRevokedRes.status);
    if (downloadRevokedRes.status !== 410) {
      throw new Error("Expected download of revoked certificate to return 410 Gone");
    }
  } finally {
    // Clean up test certificate
    await prisma.certificate.delete({
      where: { certificateId: testRevokedCert.certificateId }
    });
    console.log("Cleaned up temporary test certificate.");
  }

  // 7. Test Verified certificate endpoint
  console.log("\n7. Testing verify on valid certificate...");
  const verifyValidReq = new NextRequest(
    `http://localhost:3000/api/public/certificates/verify/${sampleCert.certificateId}`
  );
  const verifyValidRes = await getVerify(verifyValidReq, {
    params: { certificateId: sampleCert.certificateId }
  });
  const verifyValidJson = await verifyValidRes.json();
  console.log("Verify valid status:", verifyValidRes.status);
  console.log("Verify valid body:", verifyValidJson);
  if (verifyValidJson.status !== "verified") {
    throw new Error("Expected verify status to be 'verified'");
  }
  if (verifyValidJson.certificate.semester !== null) {
    throw new Error(`Expected verify certificate semester to be null, got ${verifyValidJson.certificate.semester}`);
  }

  // 8. Test /c/:certificateId redirect
  console.log("\n8. Testing /c/:certificateId redirect...");
  const redirectReq = new NextRequest(`http://localhost:3000/c/${sampleCert.certificateId}`);
  const redirectRes = await getCRedirect(redirectReq, {
    params: { certificateId: sampleCert.certificateId }
  });
  console.log("Redirect HTTP status:", redirectRes.status);
  console.log("Redirect Location header:", redirectRes.headers.get("location"));
  if (redirectRes.status !== 307 || !redirectRes.headers.get("location")?.includes(`/certificate/verify/${sampleCert.certificateId}`)) {
    throw new Error("Redirect failed to route to /certificate/verify/:certificateId");
  }

  // 9. Test CORS allowlist behavior
  console.log("\n9. Testing CORS allowlist...");
  const unallowedCorsReq = new NextRequest("http://localhost:3000/api/public/certificates/filters", {
    headers: { origin: "https://unauthorized-domain.com" }
  });
  const unallowedCorsRes = await getFilters(unallowedCorsReq);
  console.log("Disallowed origin CORS header:", unallowedCorsRes.headers.get("access-control-allow-origin"));
  if (unallowedCorsRes.headers.get("access-control-allow-origin")) {
    throw new Error("Unauthorized origin was granted CORS access!");
  }

  // 10. Test preflight OPTIONS
  console.log("\n10. Testing OPTIONS preflight...");
  const optionsReq = new NextRequest("http://localhost:3000/api/public/certificates/filters", {
    method: "OPTIONS",
    headers: { origin: "https://encypherist.online" }
  });
  const optionsRes = await optionsFilters(optionsReq);
  console.log("OPTIONS status:", optionsRes.status);
  console.log("OPTIONS CORS header:", optionsRes.headers.get("access-control-allow-origin"));
  if (optionsRes.status !== 204 || optionsRes.headers.get("access-control-allow-origin") !== "https://encypherist.online") {
    throw new Error("OPTIONS preflight failed");
  }

  // 11. Test rate limiting (exceeding 30 requests/min returns 429)
  console.log("\n11. Testing rate limiter on verify & download (IP limit: 30 requests/minute)...");
  const testIp = "192.0.2.123";
  let lastStatus = 200;
  for (let i = 1; i <= 32; i++) {
    const rlReq = new NextRequest(`http://localhost:3000/api/public/certificates/verify/${sampleCert.certificateId}`, {
      headers: { "x-forwarded-for": testIp }
    });
    const rlRes = await getVerify(rlReq, { params: { certificateId: sampleCert.certificateId } });
    lastStatus = rlRes.status;
    if (i === 30 && rlRes.status !== 200) {
      throw new Error(`Expected 30th request to succeed with 200, got ${rlRes.status}`);
    }
    if (i === 31) {
      if (rlRes.status !== 429) {
        throw new Error(`Expected 31st request to be blocked with 429, got ${rlRes.status}`);
      }
      const rlJson = await rlRes.json();
      console.log("31st request HTTP status:", rlRes.status);
      console.log("31st request error response:", rlJson);
      console.log("Retry-After header:", rlRes.headers.get("retry-after"));
    }
  }

  // Also verify that download uses the rate limiter
  const downloadRlReq = new NextRequest(`http://localhost:3000/api/public/certificates/${sampleCert.certificateId}/download`, {
    headers: { "x-forwarded-for": testIp }
  });
  const downloadRlRes = await getDownload(downloadRlReq, { params: { certificateId: sampleCert.certificateId } });
  console.log("Download rate-limited request status:", downloadRlRes.status);
  if (downloadRlRes.status !== 429) {
    throw new Error(`Expected download from exhausted IP to return 429, got ${downloadRlRes.status}`);
  }

  console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
}

runTests()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
