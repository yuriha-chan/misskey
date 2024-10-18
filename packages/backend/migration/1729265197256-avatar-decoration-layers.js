/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AvatarDecorationLayers1729265197256 {
    name = 'AvatarDecorationLayers1729265197256'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "avatar_decoration" ADD "bgUrl" character varying(1024) NOT NULL DEFAULT '', ADD "animation" character varying(1024) NOT NULL DEFAULT '', ADD "imgAnimation" character varying(1024) NOT NULL DEFAULT '', ADD "bgAnimation" character varying(1024) NOT NULL DEFAULT '', ADD "mixBlendMode" character varying(256) NOT NULL DEFAULT '', ADD "bgMixBlendMode" character varying(256) NOT NULL DEFAULT ''`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "avatar_decoration" DROP COLUMN "bgUrl", DROP COLUMN "animation", DROP COLUMN "imgAnimation", DROP COLUMN "bgAnimation", DROP COLUMN "mixBlendMode", DROP COLUMN "bgMixBlendMode"`);
    }
}
