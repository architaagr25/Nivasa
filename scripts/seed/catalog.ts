// Demo catalogue for Company A. Project details and RERA numbers are placeholders until
// the client shares the registered ones.

export const GO_LIVE = "2026-10-19"; // leads from this date onward are answered by Nivasa

export const projects = [
  {
    id: "project-1",
    name: "Project 1",
    reraNumber: "PR/GJ/AHMEDABAD/DEMO/P1-0001",
    locality: "Shela, Ahmedabad",
    address: "Site office, Project 1, Shela, Ahmedabad 380058",
    latitude: "23.0012",
    longitude: "72.4637",
    heroImage: "/images/project-1.webp",
    minPriceInr: 7_800_000,
  },
  {
    id: "project-2",
    name: "Project 2",
    reraNumber: "PR/GJ/AHMEDABAD/DEMO/P2-0002",
    locality: "Gota, Ahmedabad",
    address: "Site office, Project 2, Gota, Ahmedabad 382481",
    latitude: "23.1009",
    longitude: "72.5414",
    heroImage: "/images/project-2.webp",
    minPriceInr: 6_500_000,
  },
] as const;

type Fact = {
  code: string;
  category:
    | "overview"
    | "configuration"
    | "pricing"
    | "amenities"
    | "location"
    | "possession"
    | "legal"
    | "payment";
  label: string;
  value: string;
};

// Deliberately absent, so the assistant has to hand off: parking charges, maintenance,
// floor-rise, availability of a specific floor or facing, offers and discounts.
export const facts: Record<string, Fact[]> = {
  "project-1": [
    {
      code: "P1-OVR",
      category: "overview",
      label: "Project",
      value:
        "Two towers of 14 floors with 240 apartments: 96 two-bedroom and 144 three-bedroom homes.",
    },
    {
      code: "P1-CFG-2BHK",
      category: "configuration",
      label: "2 BHK",
      value: "Carpet area 745 sq ft (69.2 sq m) as registered with RERA.",
    },
    {
      code: "P1-CFG-3BHK",
      category: "configuration",
      label: "3 BHK",
      value: "Carpet area 1,080 sq ft (100.3 sq m) as registered with RERA.",
    },
    {
      code: "P1-PRC-2BHK",
      category: "pricing",
      label: "2 BHK starting price",
      value:
        "Indicative starting price ₹78 lakh plus government charges. The final price depends on floor and facing and is confirmed by the sales team.",
    },
    {
      code: "P1-PRC-3BHK",
      category: "pricing",
      label: "3 BHK starting price",
      value:
        "Indicative starting price ₹1.02 crore plus government charges. The final price depends on floor and facing and is confirmed by the sales team.",
    },
    {
      code: "P1-AMN",
      category: "amenities",
      label: "Amenities",
      value: "Clubhouse, swimming pool, gym, children's play area and a landscaped garden.",
    },
    {
      code: "P1-PRK",
      category: "amenities",
      label: "Parking",
      value: "Covered car and two-wheeler parking in two basement levels.",
    },
    {
      code: "P1-LOC",
      category: "location",
      label: "Location",
      value: "Shela, west Ahmedabad. The site office is at the project entrance.",
    },
    {
      code: "P1-HRS",
      category: "location",
      label: "Site visits",
      value: "The site office is open every day from 10 am to 6 pm for site visits.",
    },
    {
      code: "P1-POS",
      category: "possession",
      label: "Possession",
      value: "Possession date as registered with RERA: December 2028.",
    },
    {
      code: "P1-RERA",
      category: "legal",
      label: "RERA registration",
      value: "PR/GJ/AHMEDABAD/DEMO/P1-0001",
    },
    {
      code: "P1-PAY",
      category: "payment",
      label: "Payment plan",
      value:
        "Construction-linked payment plan. Home loans are available from several banks; the sales team shares the current list.",
    },
  ],
  "project-2": [
    {
      code: "P2-OVR",
      category: "overview",
      label: "Project",
      value:
        "Three towers of 12 floors with 180 apartments: 108 two-bedroom and 72 three-bedroom homes.",
    },
    {
      code: "P2-CFG-2BHK",
      category: "configuration",
      label: "2 BHK",
      value: "Carpet area 690 sq ft (64.1 sq m) as registered with RERA.",
    },
    {
      code: "P2-CFG-3BHK",
      category: "configuration",
      label: "3 BHK",
      value: "Carpet area 960 sq ft (89.2 sq m) as registered with RERA.",
    },
    {
      code: "P2-PRC-2BHK",
      category: "pricing",
      label: "2 BHK starting price",
      value:
        "Indicative starting price ₹65 lakh plus government charges. The final price depends on floor and facing and is confirmed by the sales team.",
    },
    {
      code: "P2-PRC-3BHK",
      category: "pricing",
      label: "3 BHK starting price",
      value:
        "Indicative starting price ₹84 lakh plus government charges. The final price depends on floor and facing and is confirmed by the sales team.",
    },
    {
      code: "P2-AMN",
      category: "amenities",
      label: "Amenities",
      value: "Clubhouse, gym, multipurpose hall, children's play area and a jogging track.",
    },
    {
      code: "P2-PRK",
      category: "amenities",
      label: "Parking",
      value: "Covered car parking in one basement level and open two-wheeler parking.",
    },
    {
      code: "P2-LOC",
      category: "location",
      label: "Location",
      value: "Gota, north-west Ahmedabad. The site office is at the project entrance.",
    },
    {
      code: "P2-HRS",
      category: "location",
      label: "Site visits",
      value: "The site office is open every day from 10 am to 6 pm for site visits.",
    },
    {
      code: "P2-POS",
      category: "possession",
      label: "Possession",
      value: "Possession date as registered with RERA: June 2028.",
    },
    {
      code: "P2-RERA",
      category: "legal",
      label: "RERA registration",
      value: "PR/GJ/AHMEDABAD/DEMO/P2-0002",
    },
    {
      code: "P2-PAY",
      category: "payment",
      label: "Payment plan",
      value:
        "Construction-linked payment plan. Home loans are available from several banks; the sales team shares the current list.",
    },
  ],
};

export const DEMO_PASSWORD = "NivasaDemo#2026";

export const salesHead = {
  name: "Meera Desai",
  email: "meera@nivasa.demo",
  phone: "+917000100001",
};

export const executives = [
  { name: "Rahul Mehta", email: "rahul@nivasa.demo", projectId: "project-1" },
  { name: "Pooja Trivedi", email: "pooja@nivasa.demo", projectId: "project-1" },
  { name: "Kunal Shah", email: "kunal@nivasa.demo", projectId: "project-1" },
  { name: "Ankita Bhatt", email: "ankita@nivasa.demo", projectId: "project-1" },
  { name: "Jignesh Parmar", email: "jignesh@nivasa.demo", projectId: "project-1" },
  { name: "Riya Vyas", email: "riya@nivasa.demo", projectId: "project-1" },
  { name: "Harsh Pandya", email: "harsh@nivasa.demo", projectId: "project-2" },
  { name: "Nisha Raval", email: "nisha@nivasa.demo", projectId: "project-2" },
  { name: "Chirag Modi", email: "chirag@nivasa.demo", projectId: "project-2" },
  { name: "Devangi Joshi", email: "devangi@nivasa.demo", projectId: "project-2" },
  { name: "Vivek Thakkar", email: "vivek@nivasa.demo", projectId: "project-2" },
].map((e, i) => ({ ...e, phone: `+9170001000${String(i + 10).padStart(2, "0")}` }));

export const SLOT_TIMES = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];

export const slotTemplates = projects.flatMap((p) =>
  [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
    SLOT_TIMES.map((startTime) => ({
      projectId: p.id,
      weekday,
      startTime,
      durationMin: 60,
      capacity: weekday === 0 || weekday === 6 ? 4 : 2,
      active: true,
    })),
  ),
);

export const blackouts = [
  { projectId: null, date: "2026-11-08", reason: "Diwali – sites closed" },
  { projectId: null, date: "2026-11-09", reason: "Diwali – sites closed" },
  { projectId: null, date: "2026-11-10", reason: "Gujarati New Year – sites closed" },
];

// Roughly ₹30 lakh a month of ad and portal spend, split by source.
export const monthlySpend = {
  property_portal: 1_200_000,
  social_ad: 1_350_000,
  website: 300_000,
  hoarding_call: 150_000,
} as const;

export const firstNames = [
  "Aarav",
  "Aditi",
  "Amit",
  "Anjali",
  "Bhavesh",
  "Bhumi",
  "Darshan",
  "Dhara",
  "Gaurav",
  "Hetal",
  "Hiren",
  "Isha",
  "Jay",
  "Jinal",
  "Kiran",
  "Komal",
  "Manish",
  "Mansi",
  "Mehul",
  "Neha",
  "Nirav",
  "Payal",
  "Pranav",
  "Priya",
  "Rakesh",
  "Rina",
  "Rohan",
  "Sagar",
  "Sejal",
  "Sonal",
  "Tejas",
  "Urvi",
  "Vishal",
  "Yash",
  "Zalak",
  "Arjun",
  "Kavya",
  "Siddharth",
  "Tanvi",
  "Pratik",
  "Farhan",
  "Sana",
  "Imran",
  "Ayesha",
  "Rajesh",
  "Sunita",
  "Deepak",
  "Pooja",
  "Vikram",
  "Shreya",
];

export const lastNames = [
  "Patel",
  "Shah",
  "Mehta",
  "Desai",
  "Joshi",
  "Trivedi",
  "Bhatt",
  "Pandya",
  "Parikh",
  "Modi",
  "Vyas",
  "Dave",
  "Rana",
  "Chauhan",
  "Solanki",
  "Parmar",
  "Thakkar",
  "Gandhi",
  "Sheth",
  "Amin",
  "Agarwal",
  "Sharma",
  "Gupta",
  "Jain",
  "Verma",
  "Sindhi",
  "Pathan",
  "Shaikh",
  "Mistry",
  "Raval",
];
