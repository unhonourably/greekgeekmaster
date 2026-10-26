import { describe, expect, it } from "vitest";
import { extractFindings, fraternityCountQuote, mergeFindings, sameSchool } from "@/lib/page-facts";
import { greekOrgsIn, nationalHost, orgFromHandle } from "@/lib/greek-orgs";
import { handleMatches, mentionsSchool, readGreekLife, schoolMarks, searchResults } from "@/lib/university-research";

const html = `
  <html><head><title>Greek Life</title></head><body>
    <p>The Interfraternity Council advises Sigma Chi and Beta Theta Pi.</p>
    <p>Sigma Chi chapter dues are $650 per semester for members.</p>
    <p>Beta Theta Pi houses 42 members in the chapter house and 30 out of house.</p>
    <p>Sigma Chi has 240 chapters nationwide.</p>
    <p>Email the president at president@tcu.edu or webmaster@tcu.edu.</p>
  </body></html>
`;

function cloudflare(email: string): string {
  const key = 0x5a;
  return [key, ...[...email].map((char) => char.charCodeAt(0) ^ key)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

describe("greek life page facts", () => {
  it("keeps quoted figures and school emails, and drops the rest", () => {
    const findings = extractFindings(html, "https://www.tcu.edu/greek", ["tcu.edu"], true);
    expect(findings.filter((finding) => finding.kind === "chapter").map((finding) => finding.title)).toEqual(expect.arrayContaining(["Sigma Chi", "Beta Theta Pi", "Interfraternity Council"]));
    expect(findings.find((finding) => finding.kind === "dues")?.quote).toMatch(/\$650/);
    expect(findings.find((finding) => finding.kind === "housing")?.quote).toMatch(/42 members/);
    expect(findings.find((finding) => finding.kind === "national")?.quote).toMatch(/240 chapters/);
    const emails = findings.filter((finding) => finding.kind === "email").map((finding) => finding.title);
    expect(emails).toContain("president@tcu.edu");
    expect(emails).not.toContain("webmaster@tcu.edu");
    expect(emails).not.toContain("admit@tcu.edu");
  });

  it("ignores a homepage email that is not about greek life", () => {
    const findings = extractFindings("<p>Contact admit@tcu.edu for admission.</p>", "https://www.tcu.edu/", ["tcu.edu"], false);
    expect(findings.filter((finding) => finding.kind === "email")).toEqual([]);
  });

  it("quotes a stated fraternity count", () => {
    expect(fraternityCountQuote("<div>50+</div><p>Fraternities and sororities</p>")).toBe("50+ Fraternities and sororities");
  });

  it("does not treat campus marketing numbers as dues or membership", () => {
    const marketing = "<p>An All-Inclusive Experience. $0 Cost for students to attend sporting events on campus.</p><p>Personalized attention. 1/2 of classes have fewer than 30 students.</p><p>A nationally-ranked academic community in the Big 12.</p>";
    const findings = extractFindings(marketing, "https://www.tcu.edu/", ["tcu.edu"], false);
    expect(findings).toEqual([]);
  });

  it("reads emails hidden behind links, protection and spelled-out forms", () => {
    const page = `
      <div class="staff"><h3>Preston Kell</h3><p>Coordinator, Interfraternity Council</p><a href="mailto:pkell@clemson.edu?subject=Hi">Email</a></div>
      <div class="staff"><h3>Rachel Weise</h3><p>Graduate Assistant</p><a href="/cdn-cgi/l/email-protection#${cloudflare("rweise@clemson.edu")}">[email&#160;protected]</a></div>
      <p>Panhellenic: panhellenic [at] clemson [dot] edu</p>
      <p>Office: greek&#64;clemson.edu</p>
      <p>Help desk: ithelp@clemson.edu</p>
      <p>Alpha Omega Epsilon <a href="mailto:bama.aoe@gmail.com">bama.aoe@gmail.com</a></p>
      <p>Random <a href="mailto:someone@gmail.com">someone@gmail.com</a></p>
    `;
    const emails = extractFindings(page, "https://www.clemson.edu/fsl/contact", ["clemson.edu"], true).filter((finding) => finding.kind === "email");
    const byEmail = new Map(emails.map((finding) => [finding.title, finding.detail]));
    expect(byEmail.get("pkell@clemson.edu")).toBe("Coordinator · Interfraternity Council · Preston Kell");
    expect(byEmail.get("rweise@clemson.edu")).toMatch(/^Graduate Assistant · .+ · Rachel Weise$/);
    expect(byEmail.has("panhellenic@clemson.edu")).toBe(true);
    expect(byEmail.has("greek@clemson.edu")).toBe(true);
    expect(byEmail.get("bama.aoe@gmail.com")).toBe("Greek life office · Alpha Omega Epsilon");
    expect(byEmail.has("ithelp@clemson.edu")).toBe(false);
    expect(byEmail.has("someone@gmail.com")).toBe(false);
  });

  it("only follows the school's own site", () => {
    expect(sameSchool("www.tcu.edu", "tcu.edu")).toBe(true);
    expect(sameSchool("greeklife.tcu.edu", "tcu.edu")).toBe(true);
    expect(sameSchool("tcu.edu.evil.test", "tcu.edu")).toBe(false);
    expect(sameSchool("127.0.0.1", "tcu.edu")).toBe(false);
    expect(sameSchool("localhost", "tcu.edu")).toBe(false);
  });
});

describe("reading one school", () => {
  it("reads the homepage and the greek page it links to", async () => {
    const home = `<html><head><title>TCU</title></head><body><a href="/greek-life">Student life</a><p>Email admit@tcu.edu about admission.</p></body></html>`;
    const greek = html;
    const fetchImpl = async (url: string) => {
      const ok = url === "https://www.tcu.edu" || url === "https://www.tcu.edu/" || url.includes("/greek-life");
      const body = url.includes("/greek-life") ? greek : home;
      return new Response(ok ? body : "Missing", { status: ok ? 200 : 404, headers: { "content-type": "text/html" } });
    };
    const result = await readGreekLife(["tcu.edu"], fetchImpl as typeof fetch, 5_000);
    expect(result.error).toBeNull();
    expect(result.pages.some((page) => page.ok && page.url.includes("greek"))).toBe(true);
    expect(mergeFindings([result.findings]).some((finding) => finding.title === "president@tcu.edu")).toBe(true);
    expect(result.findings.some((finding) => finding.title === "admit@tcu.edu")).toBe(false);
  });

  it("reads greek chapters from a public organization directory", async () => {
    const home = `<html><head><title>TCU</title></head><body><a href="https://engage.tcu.edu/organizations">Organizations</a><p>$0 cost for sporting events. 30 students in a class. A nationally-ranked campus in the Big 12.</p></body></html>`;
    const search = JSON.stringify({
      value: [
        { Id: "1", Name: "Zeta Tau Alpha", CategoryNames: ["Panhellenic Council"], Status: "Active", Visibility: "Public", WebsiteKey: "zta", Summary: "The Gamma Psi Chapter has 120 members." },
        { Id: "2", Name: "Club Volleyball", CategoryNames: ["Sport Clubs"], Status: "Active", Visibility: "Public", WebsiteKey: "vb", Summary: "A club with 30 members." },
        { Id: "3", Name: "Kappa Kappa Gamma", CategoryNames: [], Status: "Active", Visibility: "Public", WebsiteKey: "kkg", Summary: "The Epsilon Beta chapter." },
        { Id: "4", Name: "Kappa Delta Pi Education Honor Society", CategoryNames: ["Academic/Honors Society"], Status: "Active", Visibility: "Public", WebsiteKey: "kdp", Summary: "An honor society." },
      ],
    });
    const detail = JSON.stringify({
      name: "Zeta Tau Alpha",
      email: "grace.flesher@tcu.edu",
      summary: "The Gamma Psi Chapter has 120 members.",
      description: "<p>Chapter dues are $650 per semester.</p>",
      primaryContact: { firstName: "Grace", lastName: "Flesher", primaryEmailAddress: "grace.flesher@tcu.edu" },
      websiteKey: "zta",
    });
    const fetchImpl = async (url: string) => {
      if (url === "https://www.tcu.edu" || url === "https://www.tcu.edu/") return new Response(home, { status: 200, headers: { "content-type": "text/html" } });
      if (url.includes("/api/discovery/search/organizations")) return new Response(search, { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/api/discovery/organization/1")) return new Response(detail, { status: 200, headers: { "content-type": "application/json" } });
      return new Response("Missing", { status: 404, headers: { "content-type": "text/html" } });
    };
    const result = await readGreekLife(["tcu.edu"], fetchImpl as typeof fetch, 8_000);
    expect(result.findings.some((finding) => finding.kind === "chapter" && finding.title === "Zeta Tau Alpha")).toBe(true);
    expect(result.findings.some((finding) => finding.title === "Club Volleyball")).toBe(false);
    expect(result.findings.some((finding) => finding.kind === "chapter" && finding.title === "Kappa Kappa Gamma")).toBe(true);
    expect(result.findings.some((finding) => finding.title.includes("Kappa Delta Pi"))).toBe(false);
    const email = result.findings.find((finding) => finding.kind === "email" && finding.title === "grace.flesher@tcu.edu");
    expect(email?.detail).toBe("Primary contact · Zeta Tau Alpha · Grace Flesher");
    expect(result.findings.some((finding) => finding.kind === "members" && finding.quote?.includes("120"))).toBe(true);
    expect(result.findings.some((finding) => finding.kind === "dues" && finding.quote?.includes("$650"))).toBe(true);
    expect(result.findings.some((finding) => finding.quote?.includes("sporting events"))).toBe(false);
  });

  it("follows a campus directory to the fraternity office instead of guessing paths", async () => {
    const home = `<html><head><title>Mizzou</title></head><body><a href="/mizzou-a-z">A to Z</a><a href="/student-life">Student life</a><p>50+ Fraternities and sororities</p></body></html>`;
    const directory = `<html><head><title>A to Z</title></head><body><a href="/mizzou-a-z/f">F</a></body></html>`;
    const letter = `<html><head><title>F</title></head><body><a href="https://fsl.tcu.edu/">Fraternity and Sorority Life</a></body></html>`;
    const life = `<html><head><title>Student Life</title></head><body><p>Clubs and organizations</p></body></html>`;
    const fetchImpl = async (url: string) => {
      const body = url.includes("/mizzou-a-z/f") ? letter : url.includes("/mizzou-a-z") ? directory : url.includes("/student-life") ? life : url.includes("fsl.tcu.edu") ? html : home;
      const ok = url.startsWith("https://www.tcu.edu") || url.startsWith("https://fsl.tcu.edu");
      return new Response(ok ? body : "Missing", { status: ok ? 200 : 404, headers: { "content-type": "text/html" } });
    };
    const result = await readGreekLife(["tcu.edu"], fetchImpl as typeof fetch, 8_000);
    expect(result.pages.some((page) => page.url.includes("/greek-life"))).toBe(false);
    expect(result.pages.some((page) => page.ok && page.url.includes("fsl.tcu.edu"))).toBe(true);
    expect(result.findings.some((finding) => finding.kind === "chapter" && finding.title === "Sigma Chi")).toBe(true);
    expect(result.findings.some((finding) => finding.title === "president@tcu.edu")).toBe(true);
    expect(result.findings.some((finding) => finding.quote === "50+ Fraternities and sororities")).toBe(true);
  });

  it("opens chapter websites that mention the school and skips national sites that do not", async () => {
    const home = `<html><head><title>TCU</title></head><body><a href="/greek-life">Greek life</a></body></html>`;
    const greek = `<html><head><title>Fraternity and Sorority Life</title></head><body>
      <ul>
        <li>Sigma Chi <a href="https://tcusigmachi.org/">Chapter website</a> <a href="https://www.instagram.com/tcusigmachi/" aria-label="Instagram"></a></li>
        <li><a href="https://www.kappakappagamma.org/">Kappa Kappa Gamma</a></li>
        <li>Footer <a href="https://www.instagram.com/tcu/">Instagram</a></li>
      </ul>
    </body></html>`;
    const chapterHome = `<html><head><title>Sigma Chi at TCU</title></head><body><p>The Epsilon Lambda chapter of Sigma Chi at Texas Christian University.</p><a href="/contact">Contact us</a><a href="/recruitment">Recruitment</a><a href="/shop">Shop</a></body></html>`;
    const contact = `<html><body><h3>Jake Miller</h3><p>Chapter President</p><a href="mailto:jake.miller@tcu.edu">Email</a><p>Rush chair: <a href="mailto:tcusigmachi.rush@gmail.com">tcusigmachi.rush@gmail.com</a></p></body></html>`;
    const recruit = `<html><body><p>Our chapter has 145 active members.</p><p>New member dues are $1,150 per semester.</p></body></html>`;
    const national = `<html><head><title>Kappa Kappa Gamma</title></head><body><p>Contact headquarters at hq@kkg.org.</p></body></html>`;
    const fetchImpl = async (url: string) => {
      const pick = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });
      if (url === "https://www.tcu.edu" || url === "https://www.tcu.edu/") return pick(home);
      if (url === "https://www.tcu.edu/greek-life") return pick(greek);
      if (url.startsWith("https://tcusigmachi.org/contact")) return pick(contact);
      if (url.startsWith("https://tcusigmachi.org/recruitment")) return pick(recruit);
      if (url.startsWith("https://tcusigmachi.org")) return pick(chapterHome);
      if (url.startsWith("https://www.kappakappagamma.org")) return pick(national);
      return new Response("Missing", { status: 404, headers: { "content-type": "text/html" } });
    };
    const result = await readGreekLife(["tcu.edu"], fetchImpl as typeof fetch, 8_000, { schoolName: "Texas Christian University" });
    expect(result.stats.chapterSites).toBe(1);
    expect(result.pages.some((page) => page.kind === "chapter" && page.url.includes("/contact"))).toBe(true);
    expect(result.pages.some((page) => page.url.includes("/shop"))).toBe(false);
    const byEmail = new Map(result.findings.filter((finding) => finding.kind === "email").map((finding) => [finding.title, finding.detail]));
    expect(byEmail.get("jake.miller@tcu.edu")).toBe("President · Sigma Chi · Jake Miller");
    expect(byEmail.get("tcusigmachi.rush@gmail.com")).toBe("Recruitment Chair · Sigma Chi");
    expect(byEmail.has("hq@kkg.org")).toBe(false);
    expect(result.findings.some((finding) => finding.kind === "members" && finding.title === "Sigma Chi" && finding.quote?.includes("145"))).toBe(true);
    expect(result.findings.some((finding) => finding.kind === "dues" && finding.title === "Sigma Chi" && finding.quote?.includes("$1,150"))).toBe(true);
    const sites = result.findings.filter((finding) => finding.kind === "site");
    expect(sites.some((finding) => finding.title === "Sigma Chi" && finding.detail === "Chapter website")).toBe(true);
    expect(sites.some((finding) => finding.title === "Sigma Chi" && finding.detail === "Instagram" && finding.source_url.includes("tcusigmachi"))).toBe(true);
    expect(sites.some((finding) => finding.source_url.endsWith("instagram.com/tcu"))).toBe(false);
  });

  it("follows chapter websites listed in the organization directory", async () => {
    const home = `<html><head><title>TCU</title></head><body><p>Welcome.</p></body></html>`;
    const search = JSON.stringify({ value: [{ Id: "7", Name: "Delta Gamma", CategoryNames: ["Panhellenic Council"], Status: "Active", Visibility: "Public", WebsiteKey: "dg", Summary: "" }] });
    const detail = JSON.stringify({ name: "Delta Gamma", socialMedia: { ExternalWebsite: "https://tcudeltagamma.com", InstagramUrl: "https://instagram.com/tcudg" } });
    const chapter = `<html><head><title>Delta Gamma | TCU</title></head><body><p>Delta Gamma at TCU. Email us at tcudg@gmail.com.</p></body></html>`;
    const fetchImpl = async (url: string) => {
      if (url === "https://www.tcu.edu" || url === "https://www.tcu.edu/") return new Response(home, { status: 200, headers: { "content-type": "text/html" } });
      if (url.startsWith("https://engage.tcu.edu/api/discovery/search/organizations")) return new Response(search, { status: 200, headers: { "content-type": "application/json" } });
      if (url === "https://engage.tcu.edu/api/discovery/organization/7") return new Response(detail, { status: 200, headers: { "content-type": "application/json" } });
      if (url.startsWith("https://tcudeltagamma.com")) return new Response(chapter, { status: 200, headers: { "content-type": "text/html" } });
      return new Response("Missing", { status: 404, headers: { "content-type": "text/html" } });
    };
    const result = await readGreekLife(["tcu.edu"], fetchImpl as typeof fetch, 8_000, { schoolName: "Texas Christian University" });
    expect(result.findings.some((finding) => finding.kind === "chapter" && finding.title === "Delta Gamma")).toBe(true);
    expect(result.findings.find((finding) => finding.title === "tcudg@gmail.com")?.detail).toBe("Chapter contact · Delta Gamma");
    expect(result.findings.some((finding) => finding.kind === "site" && finding.detail === "Instagram" && finding.title === "Delta Gamma")).toBe(true);
  });
});

describe("names and figures", () => {
  it("matches whole organization names only", () => {
    expect(greekOrgsIn("Alpha Phi Alpha and Alpha Phi").map((match) => match.name)).toEqual(["Alpha Phi Alpha", "Alpha Phi"]);
    expect(greekOrgsIn("Kappa Delta Pi honor society")).toEqual([]);
    expect(greekOrgsIn("Sigma Alpha Epsilon").map((match) => match.name)).toEqual(["Sigma Alpha Epsilon"]);
  });

  it("reads figures from separate blocks instead of one long run of text", () => {
    const page = "<table><tr><td>Cost of membership</td></tr><tr><td>Average new member cost is $1,200 per semester</td></tr></table><div>Fraternity and sorority members make up 32% of undergraduate students</div>";
    const findings = extractFindings(page, "https://www.tcu.edu/fsl", ["tcu.edu"], true);
    expect(findings.some((finding) => finding.kind === "dues" && finding.quote?.includes("$1,200"))).toBe(true);
    expect(findings.some((finding) => finding.kind === "members" && finding.quote?.includes("32%"))).toBe(true);
  });

  it("matches a social handle to its chapter", () => {
    expect(handleMatches("instagram.com /tcusigmachi", "Sigma Chi")).toBe(true);
    expect(handleMatches("instagram.com /ztatcu", "Zeta Tau Alpha")).toBe(true);
    expect(handleMatches("instagram.com /tcu", "Sigma Chi")).toBe(false);
  });

  it("recognizes the school on a chapter site", () => {
    const marks = schoolMarks("Texas Christian University", "tcu.edu");
    expect(mentionsSchool(marks, "", "Sigma Chi at TCU")).toBe(true);
    expect(mentionsSchool(marks, "", "Proud chapter at Texas Christian")).toBe(true);
    expect(mentionsSchool(marks, "", "Kappa Kappa Gamma national headquarters")).toBe(false);
  });

  it("does not take a state name as proof of the school", () => {
    const marks = schoolMarks("University of Missouri-Columbia", "missouri.edu");
    expect(mentionsSchool(marks, "", "Chapters in Missouri, Kansas and Texas")).toBe(false);
    expect(mentionsSchool(marks, "", "Sigma Nu at the University of Missouri")).toBe(true);
    expect(mentionsSchool(marks, "missouri sigmanu org", "")).toBe(true);
  });

  it("spots national headquarters domains", () => {
    expect(nationalHost("pibetaphi.org")).toBe(true);
    expect(nationalHost("www.kkg.org")).toBe(true);
    expect(nationalHost("tcusigmachi.org")).toBe(false);
    expect(nationalHost("tcu.byx.org")).toBe(false);
  });

  it("names a chapter from its web address", () => {
    expect(orgFromHandle("tcualphachiomega.com")).toBe("Alpha Chi Omega");
    expect(orgFromHandle("/lambdachimizzou")).toBe("Lambda Chi Alpha");
    expect(orgFromHandle("tcu.byx.org")).toBe("Beta Upsilon Chi");
    expect(orgFromHandle("/tcu")).toBeNull();
    expect(orgFromHandle("/alphaphiomega_ua")).toBeNull();
    expect(orgFromHandle("/alabamaalphaphi")).toBe("Alpha Phi");
  });

  it("skips years, times and grade averages when counting members", () => {
    const page = "<p>The 2026 Fraternity and Sorority Guide</p><p>Thursday 20th – Guest Speaker (PNMs and Active Members), 1:30-3:30PM</p><p>The average GPA of members exceeds 3.0 every term.</p><p>70 years and thousands of members later, we are thriving.</p><p>Our chapter has 120 members.</p>";
    const findings = extractFindings(page, "https://www.tcu.edu/fsl", ["tcu.edu"], true).filter((finding) => finding.kind === "members");
    expect(findings.map((finding) => finding.quote)).toEqual(["Our chapter has 120 members."]);
    expect(fraternityCountQuote("<p>2026 Fraternity and sorority report</p>")).toBeNull();
    const noise = "<p>Members are selected from the top 3% of students.</p><p>The chapter has members from over 30 different majors.</p><p>The house is 19,000 square feet and sleeps sixty of our members.</p>";
    const kinds = extractFindings(noise, "https://www.tcu.edu/fsl", ["tcu.edu"], true).map((finding) => finding.kind);
    expect(kinds).toEqual(["housing"]);
  });

  it("reads the role from the address when the page does not say", () => {
    const findings = extractFindings('<p>Delta Gamma <a href="mailto:dgbetapsipresident@gmail.com">Email us</a></p>', "https://www.ua.edu/fsl", ["ua.edu"], true);
    expect(findings.find((finding) => finding.kind === "email")?.detail).toBe("President · Delta Gamma");
  });

  it("reads school pages out of web search results", () => {
    const packed = (url: string) => `a1${Buffer.from(url).toString("base64url")}`;
    const html = [
      `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=x&amp;u=${packed("https://eoss.asu.edu/fsl")}&amp;ntb=1">Fraternity and Sorority Life</a></h2></li>`,
      `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;u=${packed("https://www.wikipedia.org/asu")}">Elsewhere</a></h2></li>`,
      `<li class="b_algo"><h2><a href="http://students.asu.edu/greek">Greek <strong>life</strong></a></h2></li>`,
    ].join("");
    expect(searchResults(html, "asu.edu")).toEqual([
      { url: "https://eoss.asu.edu/fsl", title: "Fraternity and Sorority Life" },
      { url: "https://students.asu.edu/greek", title: "Greek life" },
    ]);
  });

  it("finds a Greek life page that only web search knows about", async () => {
    const packed = `a1${Buffer.from("https://eoss.asu.edu/fsl").toString("base64url")}`;
    const pages: Record<string, string> = {
      "https://www.asu.edu/": "<title>ASU</title><a href='/about'>About</a>",
      "https://eoss.asu.edu/fsl": "<title>Fraternity and Sorority Life</title><p>Sigma Chi</p><p>Questions? <a href='mailto:greeklife@asu.edu'>greeklife@asu.edu</a></p>",
    };
    const fake = async (url: string) => {
      if (url.startsWith("https://www.bing.com/search")) return new Response(`<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=${packed}">FSL</a></h2></li>`, { status: 200, headers: { "content-type": "text/html" } });
      const body = pages[url];
      if (!body) return new Response("", { status: 404 });
      const response = new Response(body, { status: 200, headers: { "content-type": "text/html" } });
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
    const result = await readGreekLife(["asu.edu"], fake, 10_000, { schoolName: "Arizona State University" });
    expect(result.pages.some((page) => page.url === "https://eoss.asu.edu/fsl" && page.ok)).toBe(true);
    expect(result.findings.some((finding) => finding.kind === "email" && finding.title === "greeklife@asu.edu")).toBe(true);
  });
});
