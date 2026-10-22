# CubeParam

A browser-based tool for defining 3D objects and viewing them from any conceivable angle.

**[▶ Open CubeParam](https://ariel-davis.github.io/CubeParam/)** · no install, runs entirely in the browser

---

## Motivation
### Question: which of these looks like a cube?
![Three parallelepipeds](three-parallelepipeds.png)

The one on the left is too *stretched*, the one on the right too *squished*. This we know from experience, or maybe intuition.
The middle one is tricky, in part because this is how most of us were taught to draw cubes. But think about it: if one face of a cube is projected to look like a perfect square, then the opposing face must be *directly behind it*. That's not the case here.

So none of the three is an orthographic projection of a cube. Then what *is*?

### The answer

A fair approximation of light hitting the retina is orthographic projection. We consider parallelepipeds in $\mathbb{R}^2$ as defined by their three sides, and so the question becomes more tractable: Given $v_k = \left[\begin{smallmatrix} x_k \\ y_k\end{smallmatrix}\right] \in \mathbb{R}^2$ ($k = 1, 2, 3$), when are the $v_k$ orthographic projections of three perpendicular vectors of equal length in $\mathbb{R}^3$?
This turns into a lovely little exercise in linear algebra, and the answer is: if and only if
$$x_1^2 + x_2^2 + x_3^2 = y_1^2 + y_2^2 + y_3^2 \quad \text{and} \quad x_1y_1 + x_2y_2 + x_3y_3 = 0.$$
A little finessing reveals that the $v_k$ are best thought of as complex numbers. Writing $u_k = x_k + y_k i \in \mathbb{C}$, the parallelepiped spanned by the $v_k$ is the orthographic projection of a cube if and only if

$$u_1^2 + u_2^2 + u_3^2 = 0 \tag{1}$$

\- two real conditions collapse into one complex polynomial equation.

### Projective algebraic geometry over $\mathbb{C}$

If $(u_1, u_2, u_3)$ is a solution for $(1)$, then so is $(\lambda u_1, \lambda u_2, \lambda u_3)$ for any $\lambda \in \mathbb{C}$. This is no coincidence, for two reasons: algebraically, $\lambda^2$ pops out of the left-hand side; geometrically, multiplying by a non-zero complex number is simply a combined rotation and rescaling, so what was a cube drawing *remains* a cube drawing.
So the set of cube drawings, up to rotation and rescaling, is the complex projective curve

$$X = \lbrace (u_1, u_2, u_3) \in \mathbb{C}^3 - \lbrace 0 \rbrace \mid u_1^2 + u_2^2 + u_3^2 = 0 \rbrace \big/ \mathbb{C}^\times \subseteq \mathbb{P}^2_{\mathbb{C}}.$$

This is a well-understood object: $X$ is a smooth conic, isomorphic to $\mathbb{P}^1_{\mathbb{C}}$, the Riemann sphere $\mathbb{C} \cup \lbrace \infty \rbrace$. An isomorphism $\mathbb{P}^1_{\mathbb{C}} \to X$ is given by a triple of polynomials of degree $\le 2$:

$$\alpha \longmapsto \big(f_x(\alpha),\, f_y(\alpha),\, f_z(\alpha)\big).$$

**Up to rotation and dilation, orthographic drawings of a cube correspond to the point of $\mathbb{P}^1(\mathbb{C})$.**

## What CubeParam does

You define a 3D object and view it from any angle. The angle is controlled by a complex parameter $\alpha\in\CC$ which determines the projection in $\RR^2$ of points $(a,b,c)\in\RR^3$. The user controls $\alpha$ by moving a pointer on screen.

### Basic viewing options

There are two modes, **Compact** / **Polynomial**, and two anchors, **z-Axis** / **Diagonal**, for a total of four basic viewing options. The projection maps are all linear: the projections $x_\alpha, y_\alpha, z_\alpha \in \mathbb{R}^2$ of the three axes determine the projection of any point:

$$(a, b, c) \longmapsto a x_\alpha + b y_\alpha + c z_\alpha \in \mathbb{R}^2.$$

In Polynomial mode the pointer *is* $\alpha$, and $x_\alpha, y_\alpha, z_\alpha$ are polynomials in $\alpha$. Writing $\zeta = e^{2\pi i/3} = \tfrac{-1 + \sqrt{3}i}{2}$:

| | Polynomial + z-Axis | Polynomial + Diagonal |
|---|---|---|
| $\begin{bmatrix} x_\alpha \\\\ y_\alpha \\\\ z_\alpha \end{bmatrix} =$ | $\dfrac{1}{2}\begin{bmatrix} 1 - \alpha^2 \\\\ i(1 + \alpha^2) \\\\ 2\alpha \end{bmatrix}$ | $-\dfrac{i}{3\sqrt{2}}\begin{bmatrix} 1 + \sqrt{2}i\alpha + \alpha^2 \\\\ \zeta^2 + \sqrt{2}i\alpha + \zeta\alpha^2 \\\\ \zeta + \sqrt{2}i\alpha + \zeta^2\alpha^2 \end{bmatrix}$ |

Compact mode differs in two ways. First, the pointer lives in the open unit disk; The pointer - let's call it $\alpha'$ - relates to $\alpha$ by

$$\alpha' = \tfrac{2}{\pi}\arctan|\alpha| \cdot \frac{\alpha}{|\alpha|}.$$

Second, $x_\alpha, y_\alpha, z_\alpha$ are replaced with $\frac{x_\alpha}{r_\alpha}, \frac{y_\alpha}{r_\alpha}, \frac{z_\alpha}{r_\alpha}$, where

| | Polynomial + z-Axis | Polynomial + Diagonal |
|---|---|---|
| $r_\alpha =$ | $\dfrac{1 + \lvert\alpha\rvert^2}{2}$ | $\dfrac{1 + \lvert\alpha\rvert^2}{3\sqrt{2}}$ |

These normalized vectors are projections of an ortho*normal* basis in $\mathbb{R}^3$.

### Perspective

Perspective is available to aid depth perception, using the depth coordinate $h_{x/y/z,\alpha}$ for each axis:

| | Polynomial + z-Axis | Polynomial + Diagonal |
|---|---|---|
| $\begin{bmatrix} h_{x,\alpha} \\\\ h_{y,\alpha} \\\\ h_{z,\alpha}\end{bmatrix} =$ | $\begin{bmatrix} -\Re(\alpha) \\\\ -\Im(\alpha) \\\\ \frac{1 - \lvert\alpha\rvert^2}{2} \end{bmatrix}$ | $\dfrac{1}{6}\begin{bmatrix} 1 - \lvert\alpha\rvert^2 + 2\sqrt{2}\,\Im(\alpha) \\\\ 1 - \lvert\alpha\rvert^2 + 2\sqrt{2}\,\Im(\zeta\alpha) \\\\ 1 - \lvert\alpha\rvert^2 + 2\sqrt{2}\,\Im(\zeta^2\alpha) \end{bmatrix}$ |

When perspective is enabled the user controls the scaling factor $P$. In Compact mode the focal distance is $F = 1/P$; in Polynomial mode it scales with $r_\alpha$, giving $F = r_\alpha / P$. Either way — taking $r_\alpha := 1$ in Compact mode — the point $r_\alpha(u, h) = (r_\alpha u, r_\alpha h) \in \mathbb{C} \times \mathbb{R}$ is projected onto $r_\alpha \frac{1}{1 - Ph} u \in \mathbb{C}$.

### What you can display

- Define points, segments, polygonal faces, and parametric curves.
- Numerical input supports symbolic expressions.
- Use auxiliary variables for versatile control of numerical, color, and boolean values.

### Demo scenes

Six scenes ship with the app:

| Scene | |
|---|---|
| **Cube** | the Cube in "CubeParam" |
| **Rhombic Dodecahedron** | with named vertices and $x,y,z$ axes |
| **Compound of 5 Tetrahedra** | a regular dodecahedron's 20 vertices, split 5 ways |
| **Trefoil Knot** | a cubic trefoil |
| **Loxodrome Spiral Ribbon** | a spiral on a sphere |
| **Constellations** | the prominent stars of the night sky |

## Running it locally

No build step and no dependencies to install. Clone and serve the directory:

```sh
git clone https://github.com/Ariel-Davis/cubeparam
cd cubeparam
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly from the filesystem also works in most browsers.)

## What's next

### In CubeParam

- A version designed for small screens (phone).
- Face drawing requires fragmenting the faces (BSP algorithm). Rendered with WebKit this leaves visible seams between face fragments, which should be fixed. Rendering with Blink is seamless. Pun intended.
- Proper cohabitation on canvas of faces with vertices and segments.
- Surfaces, either parametric or as solutions to implicit equations.
- A light source fixed by the tablet compass.

### Cubes on grids

Use the underlying math to classify all orthographic projections of cubes whose vertices lie on a square or triangular lattice. Tweaking the isomorphisms $\mathbb{P}^1 \simeq X$ that define both Polynomial modes gives

$$\varphi_i \colon \alpha \longmapsto \big(1 - \alpha^2,\ i(1 + \alpha^2),\ 2\alpha\big),$$

$$\varphi_\zeta \colon \alpha \longmapsto \big(1 + 2\alpha - 2\alpha^2,\ \zeta^2 + 2\alpha - 2\zeta\alpha^2,\ \zeta + 2\alpha - 2\zeta^2\alpha^2\big),$$

defined over $\mathbb{Q}(i)$ and $\mathbb{Q}(\zeta)$ respectively. Homogenizing and restricting to integral points gives

$$\Phi_i \colon \mathbb{Z}[i]^2 \to \mathbb{Z}[i]^3, \qquad [s:t] \longmapsto \big[t^2 - s^2 : i(t^2 + s^2) : 2st\big],$$

$$\Phi_\zeta \colon \mathbb{Z}[\zeta]^2 \to \mathbb{Z}[\zeta]^3, \qquad [s:t] \longmapsto \big[t^2 + 2st - 2s^2 : \zeta^2t^2 + 2st - 2\zeta s^2 : \zeta t^2 + 2st - 2\zeta^2 s^2\big].$$

Between them, $\Phi_i$ and $\Phi_\zeta$ classify essentially all orthographic projections of cubes with vertices on the square lattice $\mathbb{Z}[i] = \lbrace a + bi \mid a, b \in \mathbb{Z}\rbrace$ and the triangular lattice $\mathbb{Z}[\zeta] = \lbrace a + b\zeta \mid a, b \in \mathbb{Z}\rbrace$.

### Visualizing knot colorings

Build on CubeParam's display capabilities to visualize the knot-theoretic notion of *knot colorings*. Knot theory studies what might be described as tangles of closed loops of string; a knot coloring is a way to color the projection of a knot, and the colorings of a knot $K$ can tell us a lot about $K$. The idea is to input a 3D model of a knot $K$ together with a coloring $c$; as $K$ rotates, the projected image shifts around, shifting the colors of $c$ accordingly.

---

**Ariel Davis**

Design and specification by the author; implementation by Claude Code.
