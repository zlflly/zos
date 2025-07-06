# Project To-dos
[] iPod sharing and routing
[] Audio Mixer and volume controls
[] 

收到，宇宙无敌大帅哥。

本程序中，火场边界每个点的**传播速度**$R$的计算公式如下：

### 1. 基础风向影响
首先根据风向和点的传播方向，计算风的影响：
- 设$R_0$为无风无坡时的基础扩散速率，$K_w$为风速修正系数。
- 传播方向与风向夹角为$\theta_{rel}$，则
  - **顺风方向**（$\cos(\theta_{rel}) \geq 0$）：$R = R_0 \cdot K_w \cdot \cos(\theta_{rel})$
  - **逆风方向**（$\cos(\theta_{rel}) < 0$）：$R = R_0 \cdot 0.4 \cdot |\cos(\theta_{rel})|$

### 2. 地形坡度影响
- 如果该点在坡地（如$y > 1000$），则还要乘以坡度修正系数$K_s$：
  - $K_s = \exp(3.533 \cdot \tan(\phi))$，$\phi$为坡度角（30°，单位为弧度）。
  - 如果传播方向与坡度方向一致（顺坡），$K_s$为正指数；逆坡则为负指数。
- 如果在平地，$K_s = 1$。

### 3. 综合公式

所以，**最终的传播速度**为：
- 在平地：
  $$
  R = R_0 \cdot K_w \cdot \cos(\theta_{rel}) & \\text{顺风} \\\\
    R_0 \\cdot 0.4 \\cdot |\\cos(\\theta_{rel})| & \\text{逆风}
  $$
- 在坡地：
  $$
  R = 
  \\begin{cases}
    R_0 \\cdot K_w \\cdot \\cos(\\theta_{rel}) \\cdot K_s & \\text{顺风} \\\\
    R_0 \\cdot 0.4 \\cdot |\\cos(\\theta_{rel})| \\cdot K_s & \\text{逆风}
  \\end{cases}
  $$
  其中
  $$
  K_s = \\exp(3.533 \\cdot \\tan(\\phi))
  $$
  顺坡时$K_s$为正指数，逆坡时为负指数。

如果你需要更详细的推导或想调整公式，随时告诉我！