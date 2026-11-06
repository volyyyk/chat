/**
 * MedChat Mobile App - Common Styles
 * Reusable style definitions
 */

import { StyleSheet } from 'react-native';
import { spacing } from './spacing';
import { colors } from './colors';
import { fontWeights, fontSizes, lineHeights } from './typography';

// Base styles
const baseStyles = StyleSheet.create({
  // Flexbox
  flex1: {
    flex: 1,
  },
  
  flexRow: {
    flexDirection: 'row',
  },
  
  flexColumn: {
    flexDirection: 'column',
  },
  
  flexWrap: {
    flexWrap: 'wrap',
  },
  
  justifyCenter: {
    justifyContent: 'center',
  },
  
  justifyStart: {
    justifyContent: 'flex-start',
  },
  
  justifyEnd: {
    justifyContent: 'flex-end',
  },
  
  justifyBetween: {
    justifyContent: 'space-between',
  },
  
  justifyAround: {
    justifyContent: 'space-around',
  },
  
  alignCenter: {
    alignItems: 'center',
  },
  
  alignStart: {
    alignItems: 'flex-start',
  },
  
  alignEnd: {
    alignItems: 'flex-end',
  },
  
  alignStretch: {
    alignItems: 'stretch',
  },
  
  selfCenter: {
    alignSelf: 'center',
  },
  
  selfStart: {
    alignSelf: 'flex-start',
  },
  
  selfEnd: {
    alignSelf: 'flex-end',
  },
  
  selfStretch: {
    alignSelf: 'stretch',
  },
  
  // Position
  positionRelative: {
    position: 'relative',
  },
  
  positionAbsolute: {
    position: 'absolute',
  },
  
  top0: {
    top: 0,
  },
  
  right0: {
    right: 0,
  },
  
  bottom0: {
    bottom: 0,
  },
  
  left0: {
    left: 0,
  },
  
  topFull: {
    top: '100%',
  },
  
  // Dimensions
  widthFull: {
    width: '100%',
  },
  
  heightFull: {
    height: '100%',
  },
  
  widthAuto: {
    width: 'auto',
  },
  
  heightAuto: {
    height: 'auto',
  },
  
  // Overflow
  overflowHidden: {
    overflow: 'hidden',
  },
  
  overflowVisible: {
    overflow: 'visible',
  },
  
  // Text
  textCenter: {
    textAlign: 'center',
  },
  
  textLeft: {
    textAlign: 'left',
  },
  
  textRight: {
    textAlign: 'right',
  },
  
  textJustify: {
    textAlign: 'justify',
  },
  
  textCapitalize: {
    textTransform: 'capitalize',
  },
  
  textUppercase: {
    textTransform: 'uppercase',
  },
  
  textLowercase: {
    textTransform: 'lowercase',
  },
  
  textEllipsis: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  
  // Visibility
  hidden: {
    display: 'none',
  },
  
  visible: {
    display: 'flex',
  },
  
  // Background
  bgTransparent: {
    backgroundColor: 'transparent',
  },
  
  bgPrimary: {
    backgroundColor: colors.primary[600],
  },
  
  bgSecondary: {
    backgroundColor: colors.secondary[600],
  },
  
  bgSuccess: {
    backgroundColor: colors.success[500],
  },
  
  bgWarning: {
    backgroundColor: colors.warning[500],
  },
  
  bgError: {
    backgroundColor: colors.error[500],
  },
  
  bgSurface: {
    backgroundColor: colors.surface.primary,
  },
  
  bgBackground: {
    backgroundColor: colors.background.primary,
  },
  
  // Border
  borderNone: {
    borderWidth: 0,
  },
  
  borderSolid: {
    borderStyle: 'solid',
  },
  
  borderPrimary: {
    borderColor: colors.primary[600],
  },
  
  borderSecondary: {
    borderColor: colors.border.primary,
  },
  
  borderError: {
    borderColor: colors.error[500],
  },
  
  // Border radius
  roundedNone: {
    borderRadius: 0,
  },
  
  roundedSm: {
    borderRadius: spacing[1],
  },
  
  rounded: {
    borderRadius: spacing[2],
  },
  
  roundedMd: {
    borderRadius: spacing[3],
  },
  
  roundedLg: {
    borderRadius: spacing[4],
  },
  
  roundedFull: {
    borderRadius: 9999,
  },
  
  // Border width
  border0: {
    borderWidth: 0,
  },
  
  border: {
    borderWidth: 1,
  },
  
  border2: {
    borderWidth: 2,
  },
  
  border4: {
    borderWidth: 4,
  },
  
  // Shadows
  shadowNone: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  
  shadowSm: {
    shadowColor: colors.shadow.color,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  
  shadow: {
    shadowColor: colors.shadow.color,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  
  shadowMd: {
    shadowColor: colors.shadow.color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  
  shadowLg: {
    shadowColor: colors.shadow.color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  
  // Opacity
  opacity0: {
    opacity: 0,
  },
  
  opacity25: {
    opacity: 0.25,
  },
  
  opacity50: {
    opacity: 0.5,
  },
  
  opacity75: {
    opacity: 0.75,
  },
  
  opacity100: {
    opacity: 1,
  },
  
  // Z-index
  z0: {
    zIndex: 0,
  },
  
  z10: {
    zIndex: 10,
  },
  
  z20: {
    zIndex: 20,
  },
  
  z30: {
    zIndex: 30,
  },
  
  z40: {
    zIndex: 40,
  },
  
  z50: {
    zIndex: 50,
  },
});

// Text styles
const textStyles = StyleSheet.create({
  // Font weights
  fontLight: {
    fontFamily: fontWeights.light,
  },
  
  fontRegular: {
    fontFamily: fontWeights.regular,
  },
  
  fontMedium: {
    fontFamily: fontWeights.medium,
  },
  
  fontSemibold: {
    fontFamily: fontWeights.semibold,
  },
  
  fontBold: {
    fontFamily: fontWeights.bold,
  },
  
  // Font sizes
  textXs: {
    fontSize: fontSizes.xs,
  },
  
  textSm: {
    fontSize: fontSizes.sm,
  },
  
  textBase: {
    fontSize: fontSizes.base,
  },
  
  textLg: {
    fontSize: fontSizes.lg,
  },
  
  textXl: {
    fontSize: fontSizes.xl,
  },
  
  text2Xl: {
    fontSize: fontSizes['2xl'],
  },
  
  text3Xl: {
    fontSize: fontSizes['3xl'],
  },
  
  // Line heights
  leadingNone: {
    lineHeight: lineHeights.none * fontSizes.base,
  },
  
  leadingTight: {
    lineHeight: lineHeights.tight * fontSizes.base,
  },
  
  leadingSnug: {
    lineHeight: lineHeights.snug * fontSizes.base,
  },
  
  leadingNormal: {
    lineHeight: lineHeights.normal * fontSizes.base,
  },
  
  leadingRelaxed: {
    lineHeight: lineHeights.relaxed * fontSizes.base,
  },
  
  leadingLoose: {
    lineHeight: lineHeights.loose * fontSizes.base,
  },
  
  // Text colors
  textPrimary: {
    color: colors.text.primary,
  },
  
  textSecondary: {
    color: colors.text.secondary,
  },
  
  textTertiary: {
    color: colors.text.tertiary,
  },
  
  textInverse: {
    color: colors.text.primaryInverse,
  },
  
  textPrimaryLight: {
    color: colors.primary[500],
  },
  
  textSecondaryLight: {
    color: colors.secondary[500],
  },
  
  textSuccess: {
    color: colors.success[500],
  },
  
  textWarning: {
    color: colors.warning[500],
  },
  
  textError: {
    color: colors.error[500],
  },
  
  // Combined text styles
  h1: {
    fontFamily: fontWeights.bold,
    fontSize: fontSizes['5xl'],
    lineHeight: lineHeights.tight * fontSizes['5xl'],
    color: colors.text.primary,
  },
  
  h2: {
    fontFamily: fontWeights.bold,
    fontSize: fontSizes['4xl'],
    lineHeight: lineHeights.tight * fontSizes['4xl'],
    color: colors.text.primary,
  },
  
  h3: {
    fontFamily: fontWeights.semibold,
    fontSize: fontSizes['3xl'],
    lineHeight: lineHeights.snug * fontSizes['3xl'],
    color: colors.text.primary,
  },
  
  h4: {
    fontFamily: fontWeights.semibold,
    fontSize: fontSizes['2xl'],
    lineHeight: lineHeights.snug * fontSizes['2xl'],
    color: colors.text.primary,
  },
  
  h5: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.xl,
    lineHeight: lineHeights.normal * fontSizes.xl,
    color: colors.text.primary,
  },
  
  h6: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.normal * fontSizes.lg,
    color: colors.text.primary,
  },
  
  body: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.normal * fontSizes.base,
    color: colors.text.primary,
  },
  
  bodySmall: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.relaxed * fontSizes.sm,
    color: colors.text.secondary,
  },
  
  label: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.snug * fontSizes.base,
    color: colors.text.primary,
  },
  
  caption: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.relaxed * fontSizes.xs,
    color: colors.text.tertiary,
  },
  
  link: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.normal * fontSizes.base,
    color: colors.primary[600],
  },
});

// Button styles
const buttonStyles = StyleSheet.create({
  // Base button
  buttonBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    minHeight: spacing[10],
  },
  
  // Button variants
  buttonPrimary: {
    backgroundColor: colors.primary[600],
  },
  
  buttonPrimaryText: {
    color: colors.text.primaryInverse,
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
  },
  
  buttonSecondary: {
    backgroundColor: colors.surface.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  
  buttonSecondaryText: {
    color: colors.text.primary,
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
  },
  
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  
  buttonOutlineText: {
    color: colors.primary[600],
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
  },
  
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  
  buttonGhostText: {
    color: colors.text.primary,
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
  },
  
  buttonDanger: {
    backgroundColor: colors.error[500],
  },
  
  buttonDangerText: {
    color: colors.text.primaryInverse,
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
  },
  
  // Button sizes
  buttonSmall: {
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[3],
    minHeight: spacing[8],
  },
  
  buttonMedium: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    minHeight: spacing[10],
  },
  
  buttonLarge: {
    paddingVertical: spacing[2.5],
    paddingHorizontal: spacing[6],
    minHeight: spacing[12],
  },
  
  // Button states
  buttonDisabled: {
    opacity: 0.5,
  },
  
  buttonLoading: {
    opacity: 0.7,
  },
});

// Input styles
const inputStyles = StyleSheet.create({
  // Base input
  inputBase: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    minHeight: spacing[10],
  },
  
  inputText: {
    flex: 1,
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    color: colors.text.primary,
    lineHeight: lineHeights.normal * fontSizes.base,
  },
  
  inputPlaceholder: {
    color: colors.text.tertiary,
  },
  
  // Input variants
  inputPrimary: {
    backgroundColor: colors.surface.primary,
  },
  
  inputSecondary: {
    backgroundColor: colors.surface.secondary,
  },
  
  // Input states
  inputFocus: {
    borderColor: colors.primary[500],
    borderWidth: 2,
  },
  
  inputError: {
    borderColor: colors.error[500],
    borderWidth: 2,
  },
  
  inputDisabled: {
    backgroundColor: colors.surface.tertiary,
    borderColor: colors.border.tertiary,
    opacity: 0.5,
  },
  
  // Input sizes
  inputSmall: {
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
    minHeight: spacing[8],
  },
  
  inputMedium: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    minHeight: spacing[10],
  },
  
  inputLarge: {
    paddingVertical: spacing[2.5],
    paddingHorizontal: spacing[4],
    minHeight: spacing[12],
  },
});

// Card styles
const cardStyles = StyleSheet.create({
  // Base card
  cardBase: {
    backgroundColor: colors.surface.primary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: spacing[3],
    padding: spacing[4],
  },
  
  cardHeader: {
    marginBottom: spacing[3],
    paddingBottom: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  
  cardBody: {
    paddingVertical: spacing[2],
  },
  
  cardFooter: {
    marginTop: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  
  // Card variants
  cardElevated: {
    shadowColor: colors.shadow.color,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  
  cardOutline: {
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  
  // Card sizes
  cardSmall: {
    padding: spacing[3],
  },
  
  cardMedium: {
    padding: spacing[4],
  },
  
  cardLarge: {
    padding: spacing[6],
  },
});

// Chat styles
const chatStyles = StyleSheet.create({
  // Chat container
  chatContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  // Chat header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.surface.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  chatHeaderBack: {
    padding: spacing[1],
    marginRight: spacing[2],
  },
  
  chatHeaderInfo: {
    flex: 1,
  },
  
  chatHeaderTitle: {
    fontFamily: fontWeights.semibold,
    fontSize: fontSizes.lg,
    color: colors.text.primary,
  },
  
  chatHeaderSubtitle: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  
  chatHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  
  // Messages container
  messagesContainer: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  
  // Message list
  messageList: {
    flex: 1,
  },
  
  // Message bubble
  messageBubble: {
    maxWidth: '80%',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: spacing[3],
    marginVertical: spacing[1],
  },
  
  messageBubblePatient: {
    backgroundColor: colors.chat.patientBubble,
    alignSelf: 'flex-end',
    borderTopRightRadius: spacing[1],
  },
  
  messageBubbleDoctor: {
    backgroundColor: colors.chat.doctorBubble,
    alignSelf: 'flex-start',
    borderTopLeftRadius: spacing[1],
  },
  
  messageBubbleSystem: {
    backgroundColor: colors.chat.systemBubble,
    alignSelf: 'center',
    borderRadius: spacing[2],
  },
  
  messageText: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.relaxed * fontSizes.base,
  },
  
  messageTextPatient: {
    color: colors.chat.patientBubbleText,
  },
  
  messageTextDoctor: {
    color: colors.chat.doctorBubbleText,
  },
  
  messageTextSystem: {
    color: colors.chat.systemBubbleText,
    textAlign: 'center',
  },
  
  // Message time
  messageTime: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.xs,
    color: colors.text.tertiary,
    marginTop: spacing[1],
    marginLeft: spacing[2],
  },
  
  // Message status
  messageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
    marginLeft: spacing[2],
  },
  
  messageStatusIcon: {
    width: spacing[3],
    height: spacing[3],
    borderRadius: spacing[1.5],
    marginRight: spacing[1],
  },
  
  // Input bar
  inputBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4], // Extra padding for keyboard
    backgroundColor: colors.surface.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  
  inputBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.chat.inputBackground,
    borderWidth: 1,
    borderColor: colors.chat.inputBorder,
    borderRadius: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    minHeight: spacing[10],
  },
  
  inputBarText: {
    flex: 1,
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    color: colors.chat.inputText,
    lineHeight: lineHeights.normal * fontSizes.base,
    minHeight: spacing[6],
  },
  
  inputBarPlaceholder: {
    color: colors.chat.inputPlaceholder,
  },
  
  emojiButton: {
    padding: spacing[2],
    marginRight: spacing[2],
  },
  
  sendButton: {
    padding: spacing[2],
    marginLeft: spacing[2],
    backgroundColor: colors.primary[600],
    borderRadius: spacing[2],
  },
  
  sendButtonDisabled: {
    backgroundColor: colors.primary[300],
  },
  
  // Convenient time overlay
  convenientTimeContainer: {
    position: 'absolute',
    bottom: spacing[10],
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: colors.chat.convenientTimeBackground,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: spacing[2],
  },
  
  convenientTimeText: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.sm,
    color: colors.chat.convenientTimeText,
  },
  
  // File upload
  fileUploadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.chat.fileUploadBackground,
    borderWidth: 1,
    borderColor: colors.chat.fileUploadBorder,
    borderRadius: spacing[2],
    padding: spacing[2],
    marginVertical: spacing[1],
  },
  
  fileUploadIcon: {
    marginRight: spacing[2],
  },
  
  fileUploadInfo: {
    flex: 1,
  },
  
  fileUploadName: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
  },
  
  fileUploadSize: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.xs,
    color: colors.text.tertiary,
    marginTop: spacing[0.5],
  },
  
  fileUploadRemove: {
    padding: spacing[1],
  },
  
  // File retention warning
  fileRetentionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
    borderRadius: spacing[2],
    padding: spacing[2],
    marginVertical: spacing[2],
  },
  
  fileRetentionIcon: {
    marginRight: spacing[2],
  },
  
  fileRetentionText: {
    flex: 1,
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.sm,
    color: colors.warning[800],
  },
  
  // Chat list
  chatListContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  chatList: {
    flex: 1,
  },
  
  chatListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.chat.chatListItemBackground,
  },
  
  chatListItemActive: {
    backgroundColor: colors.chat.chatListItemActive,
  },
  
  chatListItemAvatar: {
    width: spacing[10],
    height: spacing[10],
    borderRadius: spacing[5],
    backgroundColor: colors.primary[100],
    marginRight: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  chatListItemInfo: {
    flex: 1,
  },
  
  chatListItemTitle: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
    color: colors.text.primary,
  },
  
  chatListItemSubtitle: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  
  chatListItemTime: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.xs,
    color: colors.text.tertiary,
  },
  
  chatListItemUnread: {
    minWidth: spacing[5],
    height: spacing[5],
    borderRadius: spacing[2.5],
    backgroundColor: colors.chat.unreadBadge,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing[2],
  },
  
  chatListItemUnreadText: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.xs,
    color: colors.chat.unreadBadgeText,
  },
  
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
  
  emptyStateIcon: {
    marginBottom: spacing[4],
  },
  
  emptyStateTitle: {
    fontFamily: fontWeights.semibold,
    fontSize: fontSizes.xl,
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  
  emptyStateSubtitle: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    color: colors.text.tertiary,
    textAlign: 'center',
    maxWidth: '80%',
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  
  loadingMore: {
    padding: spacing[4],
    alignItems: 'center',
  },
  
  // Error
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  
  errorText: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    color: colors.error[500],
    textAlign: 'center',
  },
  
  // Search
  searchContainer: {
    padding: spacing[4],
  },
  
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  
  searchInputText: {
    flex: 1,
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    color: colors.text.primary,
    marginLeft: spacing[2],
  },
  
  searchInputIcon: {
    marginRight: spacing[2],
  },
  
  // QR Scanner
  qrScannerContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  qrScanner: {
    flex: 1,
  },
  
  qrScannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  qrScannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: colors.primary[500],
    borderRadius: spacing[2],
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  
  qrScannerFrameCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 4,
    borderColor: colors.primary[500],
  },
  
  qrScannerFrameCornerTopLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  
  qrScannerFrameCornerTopRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  
  qrScannerFrameCornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  
  qrScannerFrameCornerBottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  
  qrScannerInstructions: {
    position: 'absolute',
    bottom: spacing[8],
    left: spacing[4],
    right: spacing[4],
    backgroundColor: colors.surface.primary,
    padding: spacing[4],
    borderRadius: spacing[2],
    alignItems: 'center',
  },
  
  qrScannerInstructionsText: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    color: colors.text.primary,
    textAlign: 'center',
  },
});

// Export all styles
module.exports = {
  baseStyles,
  textStyles,
  buttonStyles,
  inputStyles,
  cardStyles,
  chatStyles,
};
