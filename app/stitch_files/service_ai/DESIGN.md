---
name: Service AI
colors:
  surface: '#f6faff'
  surface-dim: '#d6dadf'
  surface-bright: '#f6faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4f9'
  surface-container: '#eaeef3'
  surface-container-high: '#e4e9ed'
  surface-container-highest: '#dfe3e8'
  on-surface: '#171c20'
  on-surface-variant: '#424654'
  inverse-surface: '#2c3135'
  inverse-on-surface: '#edf1f6'
  outline: '#737785'
  outline-variant: '#c3c6d6'
  surface-tint: '#0856cf'
  primary: '#0041a2'
  on-primary: '#ffffff'
  primary-container: '#0b57d0'
  on-primary-container: '#ced9ff'
  inverse-primary: '#b2c5ff'
  secondary: '#6e45be'
  on-secondary: '#ffffff'
  secondary-container: '#ab82fe'
  on-secondary-container: '#3f018e'
  tertiary: '#802b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#a83b00'
  on-tertiary-container: '#ffcfbe'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001847'
  on-primary-fixed-variant: '#0040a1'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5629a4'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#7f2b00'
  background: '#f6faff'
  on-background: '#171c20'
  surface-variant: '#dfe3e8'
  aurora-blue: '#4285F4'
  aurora-cyan: '#8AB4F8'
  aurora-purple: '#C67EFD'
  surface-border: '#C4C7C5'
  text-primary: '#1F1F1F'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 56px
    fontWeight: '600'
    lineHeight: 64px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.1px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max-width: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system for Service AI centers on the concept of "Digital Fluency." It is designed to feel highly intelligent, responsive, and effortlessly helpful. The aesthetic is a fusion of **Modern Minimalism** and **Glassmorphism**, characterized by vast white spaces, soft-focus backgrounds, and "Aurora" light effects that suggest a constant state of processing and assistance.

The target audience consists of productivity-focused professionals and tech-forward consumers who value speed and clarity. The emotional response should be one of "calm capability"—the interface should feel as though it is breathing with the user, using fluid motion and light-weight containers to minimize cognitive load.

## Colors

The palette is anchored in a high-clarity "Paper White" and "Mist Gray" foundation to ensure maximum readability and a fresh, airy feel. 

- **Primary & Secondary:** The Google-inspired blue serves as the functional primary for actions, while a vibrant purple-to-blue gradient ("Aurora") is reserved for AI-generated states, sparkle icons, and high-impact moments.
- **Surface Strategy:** Use `#F0F4F9` for large background areas to reduce eye strain, and `#FFFFFF` for elevated containers (cards, chat bubbles) to make content pop.
- **Gradients:** Use linear gradients at 45-degree angles combining `aurora-blue`, `aurora-purple`, and `aurora-cyan` for focus states or premium UI features.

## Typography

This design system utilizes **Hanken Grotesk** across all levels to maintain a cohesive, geometric, yet approachable personality. 

- **Weight Strategy:** Use `500` (Medium) for headlines to provide presence without appearing aggressive. Body text should remain at `400` (Regular) for optimal legibility.
- **Hierarchy:** Display sizes use slight negative letter-spacing to appear tighter and more professional. 
- **AI Interactions:** When the AI is "typing" or providing a response, use `body-lg` to prioritize the core output of the system.

## Layout & Spacing

The layout follows a **Fluid Grid** model with generous margins to evoke a sense of openness.

- **Grid:** A 12-column grid is used for desktop, 8-column for tablet, and 4-column for mobile. 
- **Rhythm:** An 8px linear scale governs all spacing. Use `24px` or `32px` for padding within cards to ensure content "breathes."
- **Alignment:** Content is generally center-aligned for landing pages and landing-style AI interfaces, shifting to left-aligned for dense data or chat history sidebars.

## Elevation & Depth

Hierarchy is achieved through **Tonal Layers** and **Subtle Shadows**. 

- **Base Layer:** The background is `#F0F4F9`.
- **Primary Layer:** Cards and chat inputs use `#FFFFFF` with a very soft, diffused shadow (`0px 4px 20px rgba(0, 0, 0, 0.04)`).
- **Floating Layer:** Modals and dropdowns use a slightly more pronounced shadow and a 1px solid border of `#C4C7C5` at low opacity (10-20%) to define edges without adding visual weight.
- **Glassmorphism:** Use a backdrop-blur (20px) on navigation bars or sidebars to maintain context of the background "Aurora" gradients.

## Shapes

The shape language is defined by **Large Radii**, conveying friendliness and modern tech.

- **Standard Elements:** Buttons, input fields, and small cards use a `0.5rem` (8px) radius.
- **Container Elements:** Chat bubbles and main content cards use `rounded-xl` (1.5rem / 24px) to create a soft, approachable framing.
- **Input Fields:** The main AI prompt bar should be **Pill-shaped** to signify it as the primary interaction point.

## Components

- **Buttons:** Primary buttons use a solid `#0B57D0` fill with white text. Secondary buttons are outlined or use a soft gray tint. All buttons feature a 200ms transition on hover with a slight elevation increase.
- **AI Prompt Bar:** A pill-shaped container with a subtle `aurora` gradient border. Inside, use a "Sparkle" icon to denote the AI capability.
- **Chips:** Highly rounded (pill-style) with a light blue background (`#E3EDFD`) and navy text, used for suggested prompts or categories.
- **Cards:** White backgrounds, `rounded-xl` corners, and no visible border unless they are placed on a white background, in which case use a `1px` border of `#F0F4F9`.
- **Inputs:** Focus states should never use harsh outlines; instead, use a 2px blue glow or a transition in border-color to `#0B57D0`.
- **Chat Bubbles:** User bubbles are neutral and right-aligned; AI bubbles are white, left-aligned, and feature the Gemini-inspired sparkle icon as an avatar.