import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function AboutSection() {
  const features = [
    {
      title: "AI Agent",
      description: "Understands intent and orchestrates real Stellar operations from natural language.",
    },
    {
      title: "Wallet & Contact Flows",
      description: "Login, onboard, manage contacts, and query balances in a chat-first interface.",
    },
    {
      title: "Payments",
      description: "Build, sign, and submit transactions with simple prompts.",
    },
  ]

  return (
    <section id="how-it-works" className="py-24 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center mb-14">
          <h2 className="mb-6 text-4xl font-light tracking-tight lg:text-5xl text-gray-900">How it works</h2>
          <p className="text-balance text-xl text-gray-600 leading-relaxed font-light">
            We combine a modern frontend, a Python AI orchestration layer, and a Stellar backend into one unified product.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
          {features.map((feature) => (
            <Card key={feature.title} className="h-full border-0 bg-white shadow-sm hover:shadow-lg transition-all duration-300 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-xl font-medium text-gray-900">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed text-gray-600 font-light">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
