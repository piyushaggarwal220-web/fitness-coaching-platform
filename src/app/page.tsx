export default function Home() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#15110D",
      color: "#F6F1E7",
      fontFamily: "sans-serif"
    }}>
      {/* Hero Section */}
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        justifyContent: "center",
        padding: "80px 20px",
        textAlign: "center",
        minHeight: "80vh"
      }}>
        <h1 style={{
          fontSize: "clamp(2.4rem, 7vw, 6.4rem)", 
          color: "#C9A227",
          marginBottom: "20px",
          fontFamily: "Big Shoulders Display, sans-serif"
        }}>
          LURVOX
        </h1>
        <h2 style={{ 
          fontSize: "clamp(1.5rem, 4vw, 2.5rem)", 
          color: "#F6F1E7",
          marginBottom: "20px",
          fontFamily: "Big Shoulders Display, sans-serif",
          fontWeight: 700,
        }}>
          ONE DECISION CHANGES EVERYTHING
        </h2>
        <p style={{ 
          fontSize: "1.15rem", 
          color: "#B9B1A6", 
          maxWidth: "560px",
          lineHeight: "1.7"
        }}>
          Tired of failed transformations? Confused about what to follow and what to skip? 
          Stop figuring it out alone — leave it to the professionals.
        </p>
        <div style={{ marginTop: "30px", display: "flex", gap: "15px", flexWrap: "wrap", justifyContent: "center" }}>
          <a href="#pricing" style={{
            background: "#FF4D2E",
            color: "white",
            padding: "16px 28px",
            borderRadius: "16px",
            textDecoration: "none",
            fontWeight: "700"
          }}>
            Start Your Transformation
          </a>
          <a href="#pricing" style={{
            background: "transparent",
            color: "#fff",
            padding: "16px 28px",
            borderRadius: "16px",
            textDecoration: "none",
            fontWeight: "700",
            border: "1.5px solid rgba(255,255,255,0.22)"
          }}>
            See Plans & Pricing
          </a>
        </div>
      </div>

      {/* Before/After Section */}
      <div style={{
        padding: "60px 20px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        textAlign: "center"
      }}>
        <div style={{ maxWidth: "800px", margin: "auto" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
            padding: "10px 14px",
            borderRadius: "999px",
            fontSize: "0.8rem",
            fontWeight: "700",
            letterSpacing: "1px",
            marginBottom: "14px"
          }}>
            MY OWN TRANSFORMATION
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px"
          }}>
            <div style={{
              background: "linear-gradient(160deg, #2a2117, #171210)",
              borderRadius: "20px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              aspectRatio: "4/5",
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center"
            }}>
              <img 
                src="/before.jpg" 
                alt="Before transformation"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }}
              />
              <span style={{
                position: "relative",
                zIndex: 2,
                margin: "14px",
                padding: "8px 14px",
                borderRadius: "999px",
                fontSize: "0.72rem",
                fontWeight: "700",
                letterSpacing: "1px",
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)",
                color: "#B9B1A6"
              }}>BEFORE</span>
            </div>
            <div style={{
              background: "linear-gradient(160deg, #2a2117, #171210)",
              borderRadius: "20px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              aspectRatio: "4/5",
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center"
            }}>
              <img 
                src="/after.jpg" 
                alt="After transformation"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }}
              />
              <span style={{
                position: "relative",
                zIndex: 2,
                margin: "14px",
                padding: "8px 14px",
                borderRadius: "999px",
                fontSize: "0.72rem",
                fontWeight: "700",
                letterSpacing: "1px",
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)",
                color: "#E0BC4A"
              }}>AFTER</span>
            </div>
          </div>
          <p style={{
            marginTop: "16px",
            fontSize: "0.85rem",
            color: "#B9B1A6",
            textAlign: "center"
          }}>
            Results vary by individual, consistency, and starting point.
          </p>
        </div>
      </div>

      {/* What You Get Section */}
      <div style={{ padding: "90px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: "1180px", margin: "auto" }}>
          <h2 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontFamily: "Big Shoulders Display, sans-serif" }}>
            WHAT YOU GET
          </h2>
          <div style={{ marginTop: "40px" }}>
            {[
              { num: "01", title: "Personalised diet plan", tag: "BUILT FOR YOU" },
              { num: "02", title: "Personalised workout plan", tag: "BUILT FOR YOU" },
              { num: "03", title: "Plan adjustments", tag: "EVERY WEEK" },
              { num: "04", title: "Progress check-ins", tag: "2X WEEKLY" },
              { num: "05", title: "Direct coach support", tag: "CALL + CHAT" },
              { num: "06", title: "Accountability system", tag: "90 DAYS" }
            ].map((item, index) => (
              <div key={index} style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr auto",
                padding: "28px 0",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                alignItems: "center"
              }}>
                <span style={{ fontFamily: "DM Mono, monospace", color: "#C9A227" }}>{item.num}</span>
                <span style={{ fontSize: "1.15rem", fontWeight: "600" }}>{item.title}</span>
                <span style={{ fontFamily: "DM Mono, monospace", color: "#B9B1A6" }}>{item.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Authority Section */}
      <div style={{ padding: "90px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: "1180px", margin: "auto" }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "40px",
            borderRadius: "24px"
          }}>
            <h2 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontFamily: "Big Shoulders Display, sans-serif" }}>
              NOT A GENERIC PDF
            </h2>
            <p style={{ color: "#B9B1A6", lineHeight: "1.8", marginTop: "18px" }}>
              Personal coaching, built specifically for you — backed by a coaching team of 20+ trainers and nutrition specialists with 6 years of experience and 6,000+ real client transformations.
            </p>
            <p style={{ color: "#B9B1A6", lineHeight: "1.8", marginTop: "18px" }}>
              Every plan is reviewed before it reaches you. Every week, it changes based on what&apos;s actually happening with your body — not a template you&apos;ll outgrow in 10 days.
            </p>
            <div style={{
              marginTop: "28px",
              padding: "18px 20px",
              borderLeft: "4px solid #C9A227",
              background: "rgba(201,162,39,0.08)",
              fontWeight: "600",
              borderRadius: "0 12px 12px 0"
            }}>
              This is for people serious about a 90-day transformation — not free advice.
            </div>

            <div style={{
              marginTop: "50px",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "20px"
            }}>
              <div style={{
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "30px",
                borderRadius: "20px",
                textAlign: "center"
              }}>
                <span style={{
                  fontFamily: "Big Shoulders Display, sans-serif",
                  fontSize: "3.4rem",
                  color: "#C9A227",
                  display: "block"
                }}>6+</span>
                <span style={{ fontSize: "0.85rem", letterSpacing: "1px", color: "#B9B1A6" }}>YEARS COACHING</span>
              </div>
              <div style={{
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "30px",
                borderRadius: "20px",
                textAlign: "center"
              }}>
                <span style={{
                  fontFamily: "Big Shoulders Display, sans-serif",
                  fontSize: "3.4rem",
                  color: "#C9A227",
                  display: "block"
                }}>6,000+</span>
                <span style={{ fontSize: "0.85rem", letterSpacing: "1px", color: "#B9B1A6" }}>CLIENTS COACHED</span>
              </div>
              <div style={{
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "30px",
                borderRadius: "20px",
                textAlign: "center"
              }}>
                <span style={{
                  fontFamily: "Big Shoulders Display, sans-serif",
                  fontSize: "3.4rem",
                  color: "#C9A227",
                  display: "block"
                }}>2x</span>
                <span style={{ fontSize: "0.85rem", letterSpacing: "1px", color: "#B9B1A6" }}>WEEKLY CHECK-INS</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div style={{ padding: "90px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }} id="pricing">
        <div style={{ maxWidth: "1180px", margin: "auto" }}>
          <h2 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontFamily: "Big Shoulders Display, sans-serif" }}>
            PLANS &amp; PRICING
          </h2>
          <p style={{ color: "#B9B1A6", maxWidth: "420px", marginTop: "10px" }}>
            Same coaching, same check-ins. Longer plans cost less per month.
          </p>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(4, 1fr)", 
            gap: "20px",
            marginTop: "40px"
          }}>
            {[
              { plan: "1 Month", price: "₹500", save: "No commitment", slug: "1_month" },
              { plan: "3 Months", price: "₹900", save: "Save ₹600 vs monthly", slug: "3_months" },
              { plan: "6 Months", price: "₹1,500", save: "Save ₹1,500 vs monthly", slug: "6_months", popular: true },
              { plan: "12 Months", price: "₹2,400", save: "Save ₹3,600 vs monthly", slug: "12_months", best: true }
            ].map((item, index) => (
              <div key={index} style={{
                background: "rgba(255,255,255,0.03)",
                border: item.popular ? "2px solid #C9A227" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: "24px",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                boxShadow: item.popular ? "0 0 40px rgba(201,162,39,0.15)" : "none"
              }}>
                {item.popular && <div style={{ 
                  display: "inline-block",
                  padding: "8px 12px",
                  background: "rgba(201,162,39,0.15)",
                  color: "#C9A227",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  marginBottom: "14px",
                  width: "fit-content"
                }}>⭐ MOST POPULAR</div>}
                {item.best && <div style={{ 
                  display: "inline-block",
                  padding: "8px 12px",
                  background: "rgba(201,162,39,0.15)",
                  color: "#C9A227",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  marginBottom: "14px",
                  width: "fit-content"
                }}>✅ BEST VALUE</div>}
                <div style={{ fontSize: "1.3rem", fontWeight: "700" }}>{item.plan}</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: "2.2rem", margin: "18px 0" }}>{item.price}</div>
                <p style={{ color: "#B9B1A6", marginBottom: "6px", fontSize: "0.92rem" }}>{item.save}</p>
                <a href={`/checkout?plan=${item.slug}`} style={{
                  background: "#FF4D2E",
                  color: "white",
                  padding: "16px 28px",
                  borderRadius: "16px",
                  textDecoration: "none",
                  fontWeight: "700",
                  textAlign: "center",
                  marginTop: "18px"
                }}>
                  Choose {item.plan} — {item.price}
                </a>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", marginTop: "30px", color: "#B9B1A6" }}>
            Most clients pick 6 or 12 months for proper results. Secure payment via Razorpay.
          </p>
        </div>
      </div>

      {/* Testimonials Section */}
      <div style={{ padding: "90px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: "1180px", margin: "auto" }}>
          <h2 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontFamily: "Big Shoulders Display, sans-serif" }}>
            WHAT CLIENTS SAY
          </h2>
          <p style={{ color: "#B9B1A6", maxWidth: "420px", marginTop: "10px" }}>
            A few of the 6,000+ people who stuck with their plan.
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
            marginTop: "40px"
          }}>
            {[
              { stars: "★★★★★", quote: "The weekly check-ins kept me honest. My coach adjusted my diet twice when my weight loss stalled — that's the part no free plan ever does.", name: "Rohit S.", meta: "Lost 9kg in 12 weeks" },
              { stars: "★★★★★", quote: "I have no gym access, so I told them upfront. The home workout plan still got me visible results by week 6.", name: "Ananya K.", meta: "Home workout plan, 6 months" },
              { stars: "★★★★★", quote: "Cheaper than I expected for actual human support. My coach replies within a day, every time I've messaged.", name: "Vikram M.", meta: "12-month plan" },
              { stars: "★★★★☆", quote: "First two weeks were tough since my coach had to rework my diet around night shifts. Once we figured that out, the rest of it actually stuck.", name: "Karan T.", meta: "Lost 6kg in 10 weeks" },
              { stars: "★★★★★", quote: "My coach didn't just send a plan, she actually asked about my schedule with the kids before building it. Down 8kg now and still going.", name: "Meera J.", meta: "8 months in, Chennai" },
              { stars: "★★★★★", quote: "The difference is someone actually looks at my weekly check-in photos and tweaks things instead of just sending the same template every month.", name: "Aditya R.", meta: "Gained 4kg lean mass" }
            ].map((item, index) => (
              <div key={index} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "20px",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "16px"
              }}>
                <div style={{ color: "#C9A227", fontSize: "0.95rem", letterSpacing: "2px" }}>{item.stars}</div>
                <p style={{ color: "#F6F1E7", fontSize: "0.98rem", lineHeight: "1.65", flexGrow: 1 }}>{item.quote}</p>
                <p style={{ fontWeight: "700", fontSize: "0.92rem" }}>{item.name}</p>
                <p style={{ color: "#B9B1A6", fontSize: "0.82rem" }}>{item.meta}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Guarantee Section */}
      <div style={{ padding: "90px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: "1180px", margin: "auto" }}>
          <div style={{
            border: "1px solid rgba(201,162,39,0.4)",
            background: "rgba(201,162,39,0.06)",
            borderRadius: "32px",
            padding: "50px",
            textAlign: "center",
            boxShadow: "0 0 60px rgba(201,162,39,0.08)"
          }}>
            <h2 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", marginBottom: "20px", color: "#C9A227", fontFamily: "Big Shoulders Display, sans-serif" }}>
              45-DAY GUARANTEE
            </h2>
            <p style={{ color: "#B9B1A6", maxWidth: "560px", margin: "0 auto", lineHeight: "1.7" }}>
              Stay consistent with your plan and check-ins. If you don&apos;t see real progress within 45 days, you get a full refund. Simple.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div style={{ padding: "90px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: "1180px", margin: "auto" }}>
          <h2 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontFamily: "Big Shoulders Display, sans-serif" }}>
            FAQ
          </h2>
          <div style={{ marginTop: "40px" }}>
            {[
              { q: "What happens right after I pay?", a: "You'll be redirected to WhatsApp to activate your coaching account. You'll answer a few quick questions and your personalised plan arrives within 24 hours." },
              { q: "Is this just an AI app?", a: "No. We use smart systems to build and update plans faster, which is exactly how we keep this affordable — but every plan is reviewed by our coaching team, and you get real human check-ins, not a chatbot." },
              { q: "Do I need a gym?", a: "No — we build your plan around what you actually have access to, gym or home, once you're onboarded." },
              { q: "What if I don't see results?", a: "You're covered by our 45-day guarantee. Stay consistent, and if it's not working, you get your money back." },
              { q: "Can I cancel anytime?", a: "Yes. Message us on WhatsApp and we'll process it — no retention calls, no hoops." },
              { q: "I'm vegetarian/vegan or have food allergies — can the plan handle that?", a: "Yes. Your onboarding form covers dietary preferences, allergies, and restrictions, and your diet plan is built around them from day one." },
              { q: "How exactly do the check-ins work?", a: "You submit your check-in through your client portal — weight, measurements, adherence, energy levels, and sleep. Your coach reviews it and adjusts your plan within 12 hours." },
              { q: "Can I switch plans later if my goals change?", a: "Yes. If you started on fat loss and want to shift toward muscle gain (or vice versa), just tell your coach on your next check-in and your plan gets rebuilt around the new goal." },
              { q: "Is there anything extra I'll need to pay for?", a: "No. Your diet plan, workout plan, weekly check-ins, and coach messaging are all included in the price you see. There's no separate fee for plan revisions or for switching goals." }
            ].map((item, index) => (
              <div key={index} style={{
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                padding: "24px 0"
              }}>
                <div style={{ fontWeight: "700", fontSize: "1rem", color: "#F6F1E7" }}>
                  {item.q}
                </div>
                <div style={{ color: "#B9B1A6", lineHeight: "1.8", marginTop: "8px" }}>
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "80px 20px 56px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 style={{ fontFamily: "Big Shoulders Display, sans-serif", fontSize: "clamp(2rem, 4vw, 3rem)" }}>
          Questions before you start?
        </h3>
        <p>
          <a href="https://wa.me/919220451577" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "#FF4D2E",
            textDecoration: "none",
            fontWeight: "700",
            fontSize: "1.05rem"
          }}>
            Message us on WhatsApp — +91 92204 51577
          </a>
        </p>
        <p style={{ marginTop: "28px", color: "#B9B1A6", fontSize: "0.85rem" }}>
          SECURE PAYMENTS VIA RAZORPAY · CANCEL ANYTIME
        </p>
        <p style={{ marginTop: "10px", color: "#B9B1A6", fontSize: "0.78rem", opacity: "0.7" }}>
          Results are not guaranteed for every individual and depend on adherence to the plan.
        </p>
      </div>
    </div>
  );
}