const { z }              = require('zod');
const authService        = require('../services/auth.service');
const { AppError }       = require('../middlewares/errorHandler'); const env                = require('../config/env');

const googleVerifySchema = z.object({
  idToken: z.string().min(1),
});

const LOCALES = ['fr', 'de', 'en'];

const registerSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  locale:    z.enum(LOCALES).optional().default('fr'),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1).max(128),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8).max(128),
});

const register = async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }));
      return res.status(400).json({ success: false, message: 'Données invalides.', errors });
    }

    const { email, password, firstName, lastName, locale } = parsed.data;
    const { user, accessToken, refreshToken } = await authService.register({
      email, password, firstName, lastName, locale,
    });

    res.cookie('refreshToken', refreshToken, authService.refreshCookieOptions());

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          locale: user.locale,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Email ou mot de passe invalide.' });
    }

    const { email, password } = parsed.data;
    const { user, accessToken, refreshToken } = await authService.login({ email, password });

    res.cookie('refreshToken', refreshToken, authService.refreshCookieOptions());

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          locale: user.locale,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'Strict',
    path: '/api/v1/auth',
  });

  res.json({ success: true, message: 'Déconnexion réussie.' });
};

const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    const { user, accessToken, refreshToken: newRefreshToken } = await authService.refreshToken(token);

    res.cookie('refreshToken', newRefreshToken, authService.refreshCookieOptions());

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          locale: user.locale,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Email invalide.' });
    }

    // Toujours répondre 200 — anti-énumération d'emails
    await authService.forgotPassword(parsed.data.email);
    res.json({ success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map(e => ({ field: e.path[0], message: e.message }));
      return res.status(400).json({ success: false, message: 'Données invalides.', errors });
    }
    await authService.resetPassword(parsed.data.token, parsed.data.password);
    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès.' });
  } catch (error) {
    next(error);
  }
};

const googleVerify = async (req, res, next) => {
  try {
    const parsed = googleVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'idToken manquant ou invalide.' });
    }

    const { user, accessToken, refreshToken } = await authService.loginWithGoogle(parsed.data.idToken);

    res.cookie('refreshToken', refreshToken, authService.refreshCookieOptions());

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id:        user.id,
          email:     user.email,
          firstName: user.first_name,
          lastName:  user.last_name,
          role:      user.role,
          locale:    user.locale,
          avatarUrl: user.avatar_url ?? null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, logout, refreshToken, forgotPassword, resetPassword, googleVerify };
