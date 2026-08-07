/** Same client transformations used on www.lurvox.in (Shopify CDN). */

export type CheckoutTransformation = {
  id: string
  image: string
  title: string
  quote: string
  name: string
  city: string
}

const CDN = 'https://cdn.shopify.com/s/files/1/0815/3133/9003/files'

export const CHECKOUT_TRANSFORMATIONS: CheckoutTransformation[] = [
  {
    id: 't1',
    image: `${CDN}/WhatsApp_Image_2026-07-15_at_12.28.22_PM.jpg`,
    title: 'Waist Down. Confidence Up.',
    quote: 'It was easy to stick to, no fancy diets or unrealistic food restrictions.',
    name: 'Rahul K.',
    city: 'Mumbai',
  },
  {
    id: 't2',
    image: `${CDN}/WhatsApp_Image_2026-07-15_at_12.03.20_PM.jpg`,
    title: 'Strength Up. Fat Down.',
    quote: 'I stopped hopping between programs and finally saw progress that actually lasted.',
    name: 'Aman P.',
    city: 'Delhi',
  },
  {
    id: 't3',
    image: `${CDN}/WhatsApp_Image_2026-07-15_at_12.02.53_PM.jpg`,
    title: 'Built Visible Abs.',
    quote: 'Focused nutrition. Progressive overload. Real accountability.',
    name: 'Vinayak S.',
    city: 'Bangalore',
  },
  {
    id: 't4',
    image: `${CDN}/WhatsApp_Image_2026-07-15_at_12.03.19_PM.jpg`,
    title: 'Lean Without Extremes.',
    quote: 'Balanced approach. Sustainable habits. Lasting results.',
    name: 'Priyanshu M.',
    city: 'Pune',
  },
  {
    id: 't5',
    image: `${CDN}/WhatsApp_Image_2026-07-15_at_12.02.20_PM.jpg`,
    title: 'Transformed In 90 Days.',
    quote: 'Commitment met with guidance. Results speak louder.',
    name: 'Arjun J.',
    city: 'Hyderabad',
  },
  {
    id: 't6',
    image: `${CDN}/WhatsApp_Image_2026-07-15_at_12.02.53_PM_5a4a3a03-b62e-400d-bc41-bd62b51986f4.jpg`,
    title: 'Stronger Than Ever.',
    quote: 'Science-backed training. Personalized nutrition. Proven system.',
    name: 'Naman K.',
    city: 'Chennai',
  },
]
