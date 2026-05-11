const authService        = require('../services/auth.service');
const { AppError }       = require('../middlewares/errorHandler');

const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, locale } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return next(new AppError('Champs obligatoires manquants : email, password, firstName, lastName.', 400));
    }

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
    const { email, password } = req.body;
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
  const env = require('../config/env');
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
    const { email } = req.body;
    if (!email) return next(new AppError('Email requis.', 400));

    // Toujours répondre 200 — anti-énumération d'emails
    await authService.forgotPassword(email);
    res.json({ success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return next(new AppError('Token et mot de passe requis.', 400));
    }
    await authService.resetPassword(token, password);
    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, logout, refreshToken, forgotPassword, resetPassword };
